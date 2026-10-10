import {createRequire} from 'module';
const require=createRequire('/tmp/task-agent-runs/01a127b9-b9fd-75af-b9ce-3c3ecd3da90c/cftest/x.js');
const sdk=require('/tmp/task-agent-runs/01a127b9-b9fd-75af-b9ce-3c3ecd3da90c/build2/cloudfunctions/syncPlayerData/node_modules/wx-server-sdk/index.js');
const fn=require('/tmp/task-agent-runs/01a127b9-b9fd-75af-b9ce-3c3ecd3da90c/build2/cloudfunctions/syncPlayerData/index.js');
let pass=0,fail=0;
async function t(name,ev,check){
  const r=await fn.main(ev,{});
  const ok=check(r);
  console.log((ok?'  PASS  ':'  FAIL  ')+name+(ok?'':'   => '+JSON.stringify(r)));
  ok?pass++:fail++;
  return r;
}
console.log('=== 入口与白名单校验 ===');
await t('无 action 被拒', {}, r=>!r.success&&r.code==='BAD_ACTION');
await t('未知 action 被拒', {action:'drop_table'}, r=>!r.success&&r.code==='UNKNOWN_ACTION');
await t('get 初始化新账号', {action:'get'}, r=>r.success&&r.data.diamonds===0&&r.data.ad_tickets===3&&r.data.cnt_share_diamond===0);
await t('get 第二次返回已有档案', {action:'get'}, r=>r.success&&r.data._id);

console.log('\n=== update 白名单：拒绝未声明字段 ===');
await t('注入 _openid 被拒', {action:'update',data:{_openid:'victim'}}, r=>!r.success&&r.code==='FIELD_NOT_ALLOWED');
await t('注入 _id 被拒', {action:'update',data:{_id:'id_1'}}, r=>!r.success&&r.code==='FIELD_NOT_ALLOWED');
await t('注入任意新字段被拒', {action:'update',data:{isAdmin:true}}, r=>!r.success&&r.code==='FIELD_NOT_ALLOWED');
await t('空 data 被拒', {action:'update',data:{}}, r=>!r.success&&r.code==='EMPTY_DATA');
await t('data 非对象被拒', {action:'update',data:[1,2]}, r=>!r.success&&r.code==='BAD_DATA');
await t('字段过多被拒', {action:'update',data:Object.fromEntries(Array.from({length:12},(_,i)=>['f'+i,1]))}, r=>!r.success);

console.log('\n=== update 类型与范围校验 ===');
await t('power 非数字串被拒', {action:'update',data:{power:'1e99'}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('power 负数被拒', {action:'update',data:{power:'-5'}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('power 60位锁榜被拒', {action:'update',data:{power:'1'+'0'.repeat(59)}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('power 31位内合法', {action:'update',data:{power:'123456'}}, r=>r.success);
await t('nickName 超长被拒', {action:'update',data:{nickName:'道'.repeat(30)}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('nickName 空白被拒', {action:'update',data:{nickName:'    '}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('nickName 违规词被拦', {action:'update',data:{nickName:'违规道号'}}, r=>!r.success&&r.isViolation);
await t('avatarUrl 任意外链被拒', {action:'update',data:{avatarUrl:'https://evil.example.com/a.png'}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('avatarUrl 微信域名放行', {action:'update',data:{avatarUrl:'https://thirdwx.qlogo.cn/x.png'}}, r=>r.success);
await t('diamonds 非整数被拒', {action:'update',data:{diamonds:1.5}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('diamonds 超上界被拒', {action:'update',data:{diamonds:9e12}}, r=>!r.success&&r.code==='FIELD_INVALID');
await t('diamonds 字符串被拒', {action:'update',data:{diamonds:'999'}}, r=>!r.success&&r.code==='FIELD_INVALID');

console.log('\n=== 资产不可由客户端直接增加（核心防刷）===');
await t('客户端自充钻石被拒', {action:'update',data:{diamonds:99999999}}, r=>!r.success&&r.code==='ASSET_INCREASE_FORBIDDEN');
await t('客户端自充功德被拒', {action:'update',data:{merit:50000}}, r=>!r.success&&r.code==='ASSET_INCREASE_FORBIDDEN');
await t('客户端自充投胎次数被拒', {action:'update',data:{ad_tickets:9999}}, r=>!r.success&&r.code==='ASSET_INCREASE_FORBIDDEN');
await t('消耗方向（减少）允许', {action:'update',data:{ad_tickets:1}}, r=>r.success);

console.log('\n=== power 单调性（防兵解掉榜 & 防降权覆盖）===');
await t('提交更低 power 不覆盖', {action:'update',data:{power:'1'}}, r=>r.success);
const st=sdk.__store.docs.find(d=>d._openid==='openid_me');
console.log('  CHECK  云端 power 仍为较高值:',st.power, st.power==='123456'?'PASS':'FAIL');
st.power==='123456'?pass++:fail++;

console.log('\n=== claimReward 服务端记账 ===');
let last;
for(let i=1;i<=11;i++){ last=await fn.main({action:'claimReward',data:{type:'share_diamond'}},{}); }
console.log('  CHECK  分享领钻第 11 次被拒:',last.code, last.code==='DAILY_LIMIT_REACHED'?'PASS':'FAIL');
last.code==='DAILY_LIMIT_REACHED'?pass++:fail++;
console.log('  CHECK  钻石=10*300 封顶:',sdk.__store.docs.find(d=>d._openid==='openid_me').diamonds, sdk.__store.docs.find(d=>d._openid==='openid_me').diamonds===3000?'PASS':'FAIL');
sdk.__store.docs.find(d=>d._openid==='openid_me').diamonds===3000?pass++:fail++;
await t('未知奖励类型被拒', {action:'claimReward',data:{type:'free_money'}}, r=>!r.success&&r.code==='BAD_REWARD_TYPE');
await t('客户端指定奖励数额无效（被忽略）', {action:'claimReward',data:{type:'free_diamond',diamonds:999999}}, r=>r.success&&r.granted.diamonds===300);

console.log('\n=== worship 服务端去重 ===');
await t('膜拜他人成功', {action:'worship',data:{targetUid:'other_1'}}, r=>r.success&&r.reward>=1&&r.reward<=10);
await t('同一对象重复膜拜被拒', {action:'worship',data:{targetUid:'other_1'}}, r=>!r.success&&r.code==='ALREADY_WORSHIPPED');
await t('膜拜自己被拒', {action:'worship',data:{targetUid:'openid_me'}}, r=>!r.success&&r.code==='SELF_WORSHIP');
await t('targetUid 非法被拒', {action:'worship',data:{targetUid:123}}, r=>!r.success&&r.code==='BAD_TARGET');
await fn.main({action:'worship',data:{targetUid:'other_2'}},{});
await fn.main({action:'worship',data:{targetUid:'other_3'}},{});
await t('超每日膜拜上限被拒', {action:'worship',data:{targetUid:'other_4'}}, r=>!r.success&&r.code==='DAILY_LIMIT_REACHED');

console.log('\n=== spend 服务端扣减 ===');
await t('负数消耗被拒', {action:'spend',data:{diamonds:-100}}, r=>!r.success&&r.code==='BAD_COST');
await t('非整数消耗被拒', {action:'spend',data:{diamonds:1.5}}, r=>!r.success&&r.code==='BAD_COST');
await t('余额不足被拒', {action:'spend',data:{diamonds:99999999}}, r=>!r.success&&r.code==='INSUFFICIENT');
await t('正常扣减成功', {action:'spend',data:{diamonds:100}}, r=>r.success&&typeof r.diamonds==='number');

console.log('\n=== 未初始化账号 ===');
sdk.__setOpenid('brand_new_user');
await t('未初始化账号 update 被拒', {action:'update',data:{power:'100'}}, r=>!r.success&&r.code==='NO_ACCOUNT');
await t('未初始化账号 claimReward 被拒', {action:'claimReward',data:{type:'share_diamond'}}, r=>!r.success&&r.code==='NO_ACCOUNT');
await t('未初始化账号 worship 被拒', {action:'worship',data:{targetUid:'x'}}, r=>!r.success&&r.code==='NO_ACCOUNT');

console.log(`\n==== 合计 PASS=${pass} FAIL=${fail} ====`);
process.exit(fail?1:0);
