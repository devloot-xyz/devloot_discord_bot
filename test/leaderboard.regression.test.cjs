const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

// Test the actual command handler with mock Discord and Prisma, no live credentials.
const source = fs.readFileSync(path.resolve(__dirname, '../src/discord/commands/leaderboard.ts'),'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true }
});
class EmbedBuilder {
  constructor() { this.fields = {}; }
  setColor(x) { this.fields.color = x; return this; }
  setTitle(x) { this.fields.title = x; return this; }
  setDescription(x) { this.fields.description = x; return this; }
  setFooter(x) { this.fields.footer = x; return this; }
}
const mod={exports:{}};
function requireMock(name) {
  if(name==='@nestjs/common')return {Injectable:()=>cls=>cls};
  if(name==='discord.js')return {EmbedBuilder,Colors:{Gold:0xFFD700}};
  if(name.endsWith('/prisma.service'))return {PrismaService:class{}};
  throw new Error('Unexpected import: '+name);
}
vm.runInNewContext('(function(require,module,exports){'+transpiled.outputText+'\n})',{}, {timeout:1000})(requireMock,mod,mod.exports);
const Command=mod.exports.LeaderboardCommand;
const user=(id,xp,username='user-'+id)=>({id,xp,username,discordId:'discord-'+id});
const obj=x=>JSON.parse(JSON.stringify(x));

async function run(rows,callerId) {
  const eligible=rows.filter(x=>x.xp>0).sort((a,b)=>b.xp-a.xp||a.id-b.id);
  const calls={findMany:0,findUnique:0,count:0};
  const db={user:{
    async findMany(q) {
      calls.findMany++;
      assert.deepEqual(obj(q.where),{xp:{gt:0}});
      assert.deepEqual(obj(q.orderBy),[{xp:'desc'},{id:'asc'}]);
      assert.equal(q.take,10,'only top ten may be fetched');
      return eligible.slice(0,10).map(x=>({discordId:x.discordId,xp:x.xp,username:x.username}));
    },
    async findUnique(q) {
      calls.findUnique++;
      assert.deepEqual(obj(q),{where:{discordId:callerId},select:{id:true,xp:true}});
      const x=rows.find(x=>x.discordId===callerId);
      return x?{id:x.id,xp:x.xp}:null;
    },
    async count(q) {
      calls.count++;
      const x=rows.find(x=>x.discordId===callerId);
      assert.ok(x && x.xp>0);
      assert.deepEqual(obj(q.where),{xp:{gt:0},OR:[{xp:{gt:x.xp}},{xp:x.xp,id:{lt:x.id}}]});
      return eligible.filter(y=>y.xp>x.xp||(y.xp===x.xp&&y.id<x.id)).length;
    },
  }};
  let reply;
  await new Command(db).handle({user:{id:callerId},async reply(message){assert.equal(reply,undefined);reply=message;}});
  return {eligible,reply,calls};
}
const cases=[
  {name:'empty board keeps original message',rows:[],caller:'discord-1',empty:true},
  {name:'ties break by ascending ID',rows:[3,1,2].map(id=>user(id,100)),caller:'discord-2',rank:2},
  {name:'XP takes priority over ID',rows:[user(1,20),user(5,100),user(2,60)],caller:'discord-2',rank:2},
  {name:'outside top 10 keeps correct rank',rows:Array.from({length:18},(_,i)=>user(18-i,10)),caller:'discord-16',rank:16},
  {name:'unlinked caller stays unranked',rows:[user(1,10)],caller:'unknown',rank:0},
  {name:'zero XP stays unranked',rows:[user(1,10),user(2,0)],caller:'discord-2',rank:0},
  {name:'negative XP stays unranked',rows:[user(1,10),user(2,-2)],caller:'discord-2',rank:0},
  {name:'missing username falls back to mention',rows:[user(1,10,null)],caller:'discord-1',rank:1,mention:true},
];
for(const c of cases)test(c.name,async()=>{
  const x=await run(c.rows,c.caller);
  assert.equal(x.calls.findMany,1);
  if(c.empty){
    assert.deepEqual(obj(x.reply),{content:'No one has earned XP yet!',ephemeral:true});
    assert.equal(x.calls.findUnique,0);
    assert.equal(x.calls.count,0);
    return;
  }
  const e=x.reply.embeds[0].fields;
  assert.equal(e.title,'Leaderboard');
  assert.equal(e.description.split('\n').length,Math.min(10,x.eligible.length));
  assert.equal(e.footer.text,c.rank?'Your rank: #'+c.rank:'Claim /daily to get on the board!');
  assert.equal(x.calls.findUnique,1);
  assert.equal(x.calls.count,c.rank?1:0);
  if(c.mention)assert.match(e.description,/<@discord-1>/);
});
test('100 randomized tie/XP/rank scenarios match reference ordering',async()=>{
  let seed=123456789;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<100;i++){
    const rows=Array.from({length:1+Math.floor(rng()*45)},(_,k)=>user(k+1,Math.floor(rng()*7)-1));
    const caller=rows[Math.floor(rng()*rows.length)];
    const expected=rows.filter(x=>x.xp>0).sort((a,b)=>b.xp-a.xp||a.id-b.id);
    const rank=caller.xp>0?expected.findIndex(x=>x.id===caller.id)+1:0;
    const actual=await run(rows,caller.discordId);
    if(!expected.length){
      assert.equal(actual.reply.content,'No one has earned XP yet!');
    }else{
      const e=actual.reply.embeds[0].fields;
      assert.equal(e.footer.text,rank?'Your rank: #'+rank:'Claim /daily to get on the board!');
      expected.slice(0,10).forEach((x,k)=>assert.ok(e.description.split('\n')[k].includes(x.username)));
    }
  }
});