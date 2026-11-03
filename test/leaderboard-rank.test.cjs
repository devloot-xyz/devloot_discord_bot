// Synthetic unit regressions on the actual TypeScript handler, not a live Discord/database test.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require(process.env.TS_COMPILER_PATH || 'typescript');
const sourcePath = process.env.LEADERBOARD_SOURCE || path.join(__dirname, '../src/discord/commands/leaderboard.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {reportDiagnostics: true, compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
  emitDecoratorMetadata: false
}});
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
class EmbedBuilder {
  constructor(){this.data = {};}
  setColor(color){this.data.color = color;return this;}
  setTitle(title){this.data.title = title;return this;}
  setDescription(description){this.data.description = description;return this;}
  setFooter(footer){this.data.footer = footer;return this;}
}
const m = {exports: {}};
function allowedRequire(name) {
  if(name === '@nestjs/common') return {Injectable: () => c => c};
  if(name === 'discord.js') return {EmbedBuilder, Colors: {Gold: 0xF1C40F}};
  if(name.includes('prisma.service')) return {PrismaService: class {}};
  throw Error('Unexpected import: '+name);
}
const wrapper = vm.runInNewContext('(function(require,module,exports){'+compiled.outputText+'\n})', {}, {timeout: 1000});
wrapper(allowedRequire,m,m.exports);
const Handler = m.exports.LeaderboardCommand;
const user = (id,xp,extra={}) => ({id,xp,discordId:'d'+id,username:'u'+id,...extra});
const cases = [
 {name:'empty leaderboard retains exact ephemeral message',rows:[],caller:'d1',empty:true},
 {name:'ties are sorted by ascending numeric user id',rows:[user(3,100),user(1,100),user(2,100)],caller:'d2',rank:2},
 {name:'highest id in a tied group has matching footer',rows:[user(3,100),user(2,100),user(1,100)],caller:'d3',rank:3},
 {name:'XP ordering precedes id ordering',rows:[user(1,20),user(2,300),user(3,100)],caller:'d3',rank:2},
 {name:'caller outside top ten gets rank without unbounded retrieval',rows:Array.from({length:15},(_,i)=>user(15-i,100)),caller:'d13',rank:13},
 {name:'missing linked user remains unranked',rows:[user(1,100)],caller:'missing',rank:null},
 {name:'zero XP caller remains unranked',rows:[user(1,100),user(2,0)],caller:'d2',rank:null},
 {name:'negative XP caller remains unranked',rows:[user(1,100),user(2,-1)],caller:'d2',rank:null},
 {name:'nonpositive users are excluded from display and rank counts',rows:[user(1,0),user(2,-3),user(3,100),user(4,100)],caller:'d4',rank:2},
 {name:'missing username retains Discord mention fallback',rows:[user(1,50,{username:null})],caller:'d1',rank:1,mention:true},
 {name:'XP tier emoji and title remain unchanged',rows:[user(1,5000),user(2,2000),user(3,500),user(4,1)],caller:'d1',rank:1,tiers:true}
];
for(const c of cases) test(c.name,async()=>{
 const calls = {findMany:0,findUnique:0,count:0};
 const eligible = c.rows.filter(u=>u.xp>0).sort((a,b)=>b.xp-a.xp||a.id-b.id);
 const normalize = o=>JSON.parse(JSON.stringify(o));
 const db = {user:{
  async findMany(options){
   const q=normalize(options);calls.findMany++;
   assert.deepEqual(q.where,{xp:{gt:0}});
   assert.equal(q.take,10,'must never retrieve an unbounded list of users');
   assert.deepEqual(q.orderBy,[{xp:'desc'},{id:'asc'}]);
   return eligible.slice(0,10).map(u=>Object.fromEntries(Object.keys(q.select).filter(k=>q.select[k]).map(k=>[k,u[k]])));
  },
  async findUnique(options){
   const q=normalize(options);calls.findUnique++;
   assert.deepEqual(q.where,{discordId:c.caller});
   assert.deepEqual(q.select,{id:true,xp:true});
   const u=c.rows.find(u=>u.discordId===c.caller);return u?{id:u.id,xp:u.xp}:null;
  },
  async count(options){
   const q=normalize(options);calls.count++;
   const caller=c.rows.find(u=>u.discordId===c.caller);assert.ok(caller&&caller.xp>0);
   assert.deepEqual(q.where,{xp:{gt:0},OR:[{xp:{gt:caller.xp}},{xp:caller.xp,id:{lt:caller.id}}]});
   return eligible.filter(u=>u.xp>caller.xp||(u.xp===caller.xp&&u.id<caller.id)).length;
  }
 }};
 let reply;await new Handler(db).handle({user:{id:c.caller},async reply(value){assert.equal(reply,undefined);reply=value;}});
 assert.equal(calls.findMany,1);assert.ok(reply);
 if(c.empty){assert.deepEqual(normalize(reply),{content:'No one has earned XP yet!',ephemeral:true});assert.equal(calls.findUnique,0);assert.equal(calls.count,0);return;}
 const embed=reply.embeds[0].data;
 assert.equal(embed.title,'Leaderboard');
 assert.equal(embed.footer.text,c.rank===null?'Claim /daily to get on the board!':'Your rank: #'+c.rank);
 assert.equal(embed.description.split('\n').length,Math.min(eligible.length,10));
 eligible.slice(0,10).forEach((u,i)=>assert.ok(embed.description.split('\n')[i].includes(u.username||'<@'+u.discordId+'>')));
 assert.equal(calls.findUnique,1);assert.equal(calls.count,c.rank===null?0:1);
 if(c.mention) assert.ok(embed.description.includes('<@d1>'));
 if(c.tiers) for(const emoji of ['⭐','🎯','🔨','📦']) assert.ok(embed.description.includes(emoji));
});
