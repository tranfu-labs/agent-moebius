// 组件库构建（Tailwind 版）：sections/<id>.html 片段 → index.html
// 用法：node component-library/build.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => join(__dir, p);

// ── 组件清单（= todolist），分组用于左侧导航 ──────────────────
export const MANIFEST = [
  { group: '基础', items: [
    { id: 'tokens',        title: '设计令牌',      desc: '近单色调色板 / 字体阶 / 圆角，颜色预算：灰阶为主·indigo 极少·绿红只在裁决' },
    { id: 'icons',         title: '图标与状态点',   desc: '线性图标 + 状态点（⣾ 运行中灰 / ✋ 等你中性 / ○ 未开始 / ✓ 中性勾）' },
  ]},
  { group: '原子', items: [
    { id: 'buttons',       title: '按钮',          desc: '主实心(indigo) / 中性次操作 / ghost / 新会话 / 发送 / 中断 / 通过·不通过分段' },
    { id: 'role-avatars',  title: '角色头像',      desc: '统一中性灰底 + 单字区分，不用色相：你/开发/测试/技术负责人/产品/用户代表/CEO' },
    { id: 'badges-counts', title: '徽标与计数',    desc: '顶栏运行中(灰)·等你(中性)计数 / 项目行尾冒泡徽标 / 验收计分 tally' },
    { id: 'breadcrumb',    title: '面包屑',        desc: '↰ 属于：目标 · X 返回父编排会话 + 右侧任务态 meta' },
  ]},
  { group: '导航骨架', items: [
    { id: 'topbar',        title: '顶栏',          desc: 'Logo + 全局计数 + 新会话按钮' },
    { id: 'sidebar',       title: '侧栏',          desc: '项目头 / 会话行三态 / 已完成折叠组 / 账本入口，选中态用中性灰' },
    { id: 'wait-popover',  title: '「等你」浮层',   desc: '跨项目汇聚的等你清单，跳转菜单非收件箱' },
  ]},
  { group: '时间线', items: [
    { id: 'user-message',  title: '用户消息',      desc: '永远全文的用户消息块，@mention 用 accent' },
    { id: 'agent-fold',    title: 'agent 折叠消息', desc: '角色+阶段+结论+交棒行，▸ 可展开全文，含展开态' },
    { id: 'handoff',       title: '交棒行',        desc: '消息间显式交棒节点，细线居中小字' },
    { id: 'run-block',     title: '运行块',        desc: '角色+耗时+步骤（✓中性/⣾灰/○）+中断，含降级单行态' },
    { id: 'composer',      title: '输入区',        desc: '输入框 + 发送 + 下方常驻等待状态文案' },
    { id: 'at-complete',   title: '@ 补全面板',     desc: '只列合法可触发角色，中文名 + 一句职责' },
  ]},
  { group: '卡片', items: [
    { id: 'accept-card',   title: '验收卡',        desc: '「轮到你了」证据先于裁决，中性呈现，逐条通过/不通过' },
    { id: 'ceo-propose',   title: 'CEO 提案卡',    desc: '阶段提案，里程碑 + 任务 + 确认按钮' },
    { id: 'event-stream',  title: '进展事件流',    desc: '子会话里程碑回流，一行一事件，等你行中性' },
  ]},
  { group: '右栏与视图', items: [
    { id: 'artifact',      title: '产物预览瓦片',   desc: '缩略图 / 文件卡，产物为主体，点开大预览' },
    { id: 'context-panel', title: '上下文面板',    desc: '产物置顶 + 验收语句状态 + 运行记录 + 任务信息沉底' },
    { id: 'ledger-tree',   title: '账本树',        desc: '唯一树形全结构：里程碑 / 任务 / 派生会话 / 闸口' },
    { id: 'empty-state',   title: '空态·新建会话',  desc: '描述目标 @ 一个角色开始 / 或从账本任务开始' },
  ]},
];

const FLAT = MANIFEST.flatMap(g => g.items.map(it => ({ ...it, group: g.group })));

const sprite = readFileSync(R('_sprite.html'), 'utf8');
const tokensCss = readFileSync(R('tokens.css'), 'utf8');
const libCss = readFileSync(R('lib.css'), 'utf8');

// Tailwind Play CDN 配置：把 CSS 变量映射成主题色
const twConfig = `tailwind.config = {
  darkMode: 'class',
  theme: { extend: {
    colors: {
      canvas:'var(--canvas)', rail:'var(--rail)', card:'var(--card)', sunken:'var(--sunken)', input:'var(--input)',
      ink:'var(--ink)', sub:'var(--sub)', hint:'var(--hint)',
      line:'var(--line)', 'line-strong':'var(--line-strong)', sel:'var(--sel)', hover:'var(--hover)',
      accent:'var(--accent)', 'accent-fg':'var(--accent-fg)',
      pass:'var(--pass)', danger:'var(--danger)',
      'ava-bg':'var(--ava-bg)', 'ava-fg':'var(--ava-fg)',
    },
    fontFamily: {
      sans:['"PingFang SC"','"Microsoft YaHei"','"Segoe UI"','system-ui','-apple-system','sans-serif'],
      mono:['"SF Mono"','Menlo','Consolas','monospace'],
    },
    boxShadow: { overlay:'0 10px 28px rgba(0,0,0,0.13),0 2px 6px rgba(0,0,0,0.08)' },
    keyframes: { breathe:{'0%,100%':{opacity:'1'},'50%':{opacity:'.35'}} },
    animation: { breathe:'breathe 2s ease-in-out infinite' },
  } }
}`;

const nav = MANIFEST.map(g => `
    <div class="nav-group">
      <div class="nav-g-h">${g.group}</div>
      ${g.items.map(it => `<a class="nav-link" data-id="${it.id}" href="?only=${it.id}">${it.title}</a>`).join('\n      ')}
    </div>`).join('\n');

const sections = FLAT.map(it => {
  const p = R(`sections/${it.id}.html`);
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  return `<section class="spec" data-component="${it.id}" id="${it.id}">
  <header class="spec-h"><h2>${it.title}</h2><code>?only=${it.id}</code><p>${it.desc}</p></header>
  <div class="spec-stage"><div class="spec-todo">⏳ 待 subagent 完成</div></div>
</section>`;
}).join('\n\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Moebius · 组件库（Tailwind）</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>${twConfig}</script>
<style>
${tokensCss}
${libCss}
</style>
</head>
<body class="lib font-sans">
${sprite}
<aside class="lib-nav scroll-thin">
  <div class="lib-brand"><span class="lib-mark"></span>Moebius 组件库</div>
  <a class="nav-link nav-all" data-id="__all" href="?">全部组件</a>
  ${nav}
  <div class="lib-theme">
    <button data-theme-set="auto" class="on">跟随系统</button>
    <button data-theme-set="light">浅色</button>
    <button data-theme-set="dark">深色</button>
  </div>
</aside>
<main class="lib-main">
${sections}
</main>
<script>
(function(){
  var only = new URLSearchParams(location.search).get('only');
  document.querySelectorAll('.spec').forEach(function(s){
    s.style.display = (!only || s.dataset.component === only) ? '' : 'none';
  });
  document.querySelectorAll('.nav-link').forEach(function(a){
    var id = a.dataset.id, active = only ? id === only : id === '__all';
    a.classList.toggle('active', active);
  });
  var root = document.documentElement;
  document.querySelectorAll('[data-theme-set]').forEach(function(b){
    b.addEventListener('click', function(){
      root.classList.remove('light','dark');
      if(b.dataset.themeSet !== 'auto') root.classList.add(b.dataset.themeSet);
      document.querySelectorAll('[data-theme-set]').forEach(function(x){ x.classList.toggle('on', x===b); });
    });
  });
  // 折叠/展开交互（若组件用 hidden 切换）
  document.addEventListener('click', function(e){
    var t = e.target.closest('[data-toggle]'); if(!t) return;
    var tgt = document.getElementById(t.getAttribute('data-toggle'));
    if(tgt) tgt.classList.toggle('hidden');
  });
})();
</script>
</body>
</html>
`;

writeFileSync(R('index.html'), html);
console.log('built index.html (Tailwind) with', FLAT.length, 'components');
