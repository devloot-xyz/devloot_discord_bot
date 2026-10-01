import { Injectable } from '@nestjs/common';
import { ButtonInteraction, MessageFlags } from 'discord.js';

export interface ComponentRoute {
  feature: string;
  action: string;
  entityId: string;
}

type ButtonHandler = (
  interaction: ButtonInteraction,
  entityId: string,
) => Promise<void>;

const COMPONENT_ID =
  /^dl:v1:([a-z][a-z0-9-]{0,31}):([a-z][a-z0-9-]{0,31}):([A-Za-z0-9_-]{1,80})$/;
const STALE_MESSAGE =
  'This button has expired. Run the command again to get a new one.';

export function parseComponentId(customId: string): ComponentRoute | null {
  if (customId.length > 100) return null;
  const match = COMPONENT_ID.exec(customId);
  if (!match) return null;
  return { feature: match[1], action: match[2], entityId: match[3] };
}

export function makeComponentId(route: ComponentRoute): string {
  const customId = `dl:v1:${route.feature}:${route.action}:${route.entityId}`;
  if (!parseComponentId(customId))
    throw new Error('Invalid pilot component route');
  return customId;
}

@Injectable()
export class PilotComponentRouter {
  private readonly handlers = new Map<string, ButtonHandler>();

  register(feature: string, action: string, handler: ButtonHandler): void {
    makeComponentId({ feature, action, entityId: 'test' });
    const key = `${feature}:${action}`;
    if (this.handlers.has(key))
      throw new Error(`Duplicate component route: ${key}`);
    this.handlers.set(key, handler);
  }

  async dispatch(interaction: ButtonInteraction): Promise<void> {
    const route = parseComponentId(interaction.customId);
    const handler =
      route && this.handlers.get(`${route.feature}:${route.action}`);
    if (!route || !handler) {
      await interaction.reply({
        content: STALE_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await handler(interaction, route.entityId);
  }
}
