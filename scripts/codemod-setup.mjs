/**
 * Options API → <script setup lang="ts"> 机械 codemod（一次性迁移工具）。
 *
 * 策略：babel AST 定位 export default 各选项，源码切片重组为 setup 代码，
 * 再按「组件符号表」重写 this.x —— data/mapState → x.value，computed → x.value，
 * methods/mapMutations/mapActions → x()，props → props.x，$refs → x.value，
 * $store/$router/$route/$emit/$t/$nextTick/$el → 对应组合式等价物。
 * 切片保留原始源码（不做 AST 重新生成），最大限度保留注释与格式。
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default;

const root = process.cwd();
const files = [];
const collect = dir => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) collect(p);
    else if (f.name.endsWith('.vue')) files.push(p);
  }
};
collect(path.join(root, 'src'));

let converted = 0;
const failures = [];

const VUE_LIFECYCLE = {
  mounted: 'onMounted',
  beforeUnmount: 'onBeforeUnmount',
  unmounted: 'onUnmounted',
  activated: 'onActivated',
  deactivated: 'onDeactivated',
  beforeMount: 'onBeforeMount',
  updated: 'onUpdated',
};

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const scriptMatch = raw.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    console.log(`SKIP (no script): ${file}`);
    continue;
  }
  const src = scriptMatch[1];
  let ast;
  try {
    ast = parse(src, { sourceType: 'module' });
  } catch (e) {
    failures.push(`${file}: PARSE ${e.message}`);
    continue;
  }

  // ---- 定位 export default {...} ----
  let optionsNode = null;
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      if (stmt.declaration.type === 'ObjectExpression') optionsNode = stmt.declaration;
      else {
        failures.push(`${file}: export default 不是对象字面量`);
      }
    }
  }
  if (!optionsNode) {
    if (!failures.some(f => f.startsWith(file))) failures.push(`${file}: 无 export default 对象`);
    continue;
  }

  const seg = n => src.slice(n.start, n.end);
  const opts = {}; // key -> node
  for (const p of optionsNode.properties) {
    if (p.type === 'SpreadElement') continue; // mapX 稍后单独处理
    const key = p.key.name || p.key.value;
    opts[key] = p;
  }

  // ---- 收集 mapX（computed/methods 里的展开与整体赋值） ----
  const mapStateNames = [];
  const mapFnNames = []; // mutations + actions → 委托 store 的同名调用
  let usesI18n = /\$t\(/.test(src);
  const stripMapSpreads = objNode => {
    if (!objNode || objNode.type !== 'ObjectExpression') return;
    objNode.properties = objNode.properties.filter(p => {
      if (p.type === 'SpreadElement' && p.argument.type === 'CallExpression') {
        const callee = p.argument.callee.name;
        const first = p.argument.arguments[0];
        if (first?.type === 'ArrayExpression') {
          const names = first.elements.map(e => e.name || e.value);
          if (callee === 'mapState' || callee === 'mapGetters') mapStateNames.push(...names);
          else mapFnNames.push(...names);
          return false;
        }
      }
      return true;
    });
  };
  const computedProp = opts.computed;
  if (computedProp) {
    if (computedProp.value?.type === 'ObjectExpression') stripMapSpreads(computedProp.value);
    if (computedProp.value?.type === 'CallExpression' && /^map(State|Getters)$/.test(computedProp.value.callee.name)) {
      computedProp.value.arguments[0].elements?.forEach(e => mapStateNames.push(e.name || e.value));
      delete opts.computed;
    }
  }
  const methodsProp = opts.methods;
  if (methodsProp?.value?.type === 'ObjectExpression') stripMapSpreads(methodsProp.value);

  // ---- data → ref() ----
  const dataRefs = []; // {name, init}
  if (opts.data) {
    const dataProp = opts.data;
    let body = null;
    if (dataProp.type === 'ObjectMethod') body = dataProp.body;
    else if (dataProp.value.type === 'FunctionExpression') body = dataProp.value.body;
    else if (dataProp.value.type === 'ArrowFunctionExpression') {
      if (dataProp.value.body.type === 'BlockStatement') body = dataProp.value.body;
      else if (dataProp.value.body.type === 'ObjectExpression') {
        for (const p of dataProp.value.body.properties) {
          if (p.type !== 'ObjectProperty') continue;
          dataRefs.push({ name: p.key.name || p.key.value, init: seg(p.value) });
        }
      }
    }
    if (body) {
      const ret = body.body?.find(s => s.type === 'ReturnStatement');
      if (ret?.argument?.type === 'ObjectExpression') {
        for (const p of ret.argument.properties) {
          if (p.type !== 'ObjectProperty') continue;
          dataRefs.push({ name: p.key.name || p.key.value, init: seg(p.value) });
        }
      }
    }
    delete opts.data;
  }

  // ---- props / emits ----
  let propsDecl = '';
  const propNames = [];
  if (opts.props) {
    const v = opts.props.value;
    if (v.type === 'ObjectExpression') {
      v.properties.forEach(p => p.type === 'ObjectProperty' && propNames.push(p.key.name || p.key.value));
    } else if (v.type === 'ArrayExpression') {
      v.elements.forEach(e => propNames.push(e.value));
    }
    propsDecl = `const props = defineProps(${seg(v)});`;
    delete opts.props;
  }
  let emitsDecl = '';
  if (opts.emits) {
    emitsDecl = `const emit = defineEmits(${seg(opts.emits.value)});`;
    delete opts.emits;
  }

  // ---- computed → computed() ----
  const computedDecls = [];
  const computedNames = [];
  if (opts.computed?.value?.type === 'ObjectExpression') {
    for (const p of opts.computed.value.properties) {
      if (p.type !== 'ObjectProperty' && p.type !== 'ObjectMethod') continue;
      const name = p.key.name || p.key.value;
      computedNames.push(name);
      if (p.type === 'ObjectMethod') {
        computedDecls.push(`const ${name} = computed(function ${name}(${p.params.map(seg).join(', ')}) ${seg(p.body)});`);
      } else if (p.value.type === 'ArrowFunctionExpression' || p.value.type === 'FunctionExpression') {
        computedDecls.push(`const ${name} = computed(function ${name}(${p.value.params.map(seg).join(', ')}) ${seg(p.value.body)});`);
      } else if (p.value.type === 'ObjectExpression') {
        computedDecls.push(`const ${name} = computed(${seg(p.value)});`);
      } else {
        computedDecls.push(`const ${name} = computed(() => ${seg(p.value)});`);
      }
    }
    delete opts.computed;
  }

  // ---- methods → function 声明（提升，任意顺序可调用） ----
  const methodDecls = [];
  const methodNames = [];
  if (opts.methods?.value?.type === 'ObjectExpression') {
    for (const p of opts.methods.value.properties) {
      if (p.type !== 'ObjectMethod' && p.type !== 'ObjectProperty') continue;
      const name = p.key.name || p.key.value;
      methodNames.push(name);
      const fn = p.type === 'ObjectMethod' ? p : p.value;
      const params = fn.params ? fn.params.map(seg).join(', ') : '';
      const body = fn.body ? seg(fn.body) : ` { return ${seg(fn.expression ?? p.value)}; }`;
      methodDecls.push(`function ${name}(${params}) ${fn.body ? seg(fn.body) : body}`);
    }
    delete opts.methods;
  }

  // ---- watch → watch() ----
  const watchDecls = [];
  if (opts.watch?.value?.type === 'ObjectExpression') {
    for (const p of opts.watch.value.properties) {
      const keySrc = seg(p.key).replace(/^['"]|['"]$/g, '');
      const v = p.type === 'ObjectMethod' ? p : p.value;
      if (p.type === 'ObjectMethod') {
        watchDecls.push(`watch(${keySrc}, function (${p.params.map(seg).join(', ')}) ${seg(p.body)});`);
      } else if (v.type === 'ObjectExpression') {
        let handler = '() => {}';
        for (const rp of v.properties) {
          if ((rp.key.name || rp.key.value) === 'handler') {
            const hv = rp.type === 'ObjectMethod' ? rp : rp.value;
            if (hv.type === 'StringLiteral') handler = hv.value;
            else
              handler = `function (${(hv.params || []).map(seg).join(', ')}) ${seg(hv.body)}`;
          }
        }
        const optsSrc = seg(v)
          .replace(/,?\s*handler\s*:\s*[^,]+/, '')
          .trim();
        watchDecls.push(`watch(${keySrc}, ${handler}, ${optsSrc === '{' + '}' || optsSrc === '' ? '{}' : optsSrc});`);
      } else if (v.type === 'FunctionExpression' || v.type === 'ArrowFunctionExpression') {
        watchDecls.push(`watch(${keySrc}, function (${v.params.map(seg).join(', ')}) ${seg(v.body)});`);
      } else if (v.type === 'StringLiteral') {
        watchDecls.push(`watch(${keySrc}, ${v.value});`);
      }
    }
    delete opts.watch;
  }

  // ---- 生命周期 ----
  const hooks = [];
  const beforeHooks = []; // created 内联
  for (const [key, wrapper] of Object.entries(VUE_LIFECYCLE)) {
    const p = opts[key];
    if (!p) continue;
    const fn = p.type === 'ObjectMethod' ? p : p.value;
    const params = (fn.params || []).map(seg).join(', ');
    const body = fn.body ? seg(fn.body) : '{}';
    if (key === 'activated' || key === 'deactivated') {
      // 当前无 keep-alive：activated 逻辑挂 onMounted 兜底首载，恢复 keep-alive 后 onActivated 生效
      hooks.push(`${wrapper}(function ${key}(${params}) ${body});`);
      if (key === 'activated') hooks.push(`onMounted(function ${key}OnMount(${params}) ${body});`);
    } else {
      hooks.push(`${wrapper}(function ${key}(${params}) ${body});`);
    }
    delete opts[key];
  }
  if (opts.created) {
    const fn = opts.created.type === 'ObjectMethod' ? opts.created : opts.created.value;
    beforeHooks.push(`// created\n  ${fn.body.body.map(seg).join('\n  ')}`);
    delete opts.created;
  }
  // vue-router 组件内守卫
  for (const guard of ['beforeRouteEnter', 'beforeRouteUpdate', 'beforeRouteLeave']) {
    const p = opts[guard];
    if (!p) continue;
    const fn = p.type === 'ObjectMethod' ? p : p.value;
    hooks.push(`${guard}(function (${fn.params.map(seg).join(', ')}) ${seg(fn.body)});`);
    delete opts[guard];
  }

  // ---- 组装 setup 主体（顺序：refs → computed → methods → created → watch → hooks） ----
  const setupParts = [];
  const usesStore =
    mapStateNames.length + mapFnNames.length > 0 || /\$store|store\./.test(src);
  if (usesStore) setupParts.push(`const store = useStore();`);
  if (mapStateNames.length)
    setupParts.push(`const { ${[...new Set(mapStateNames)].join(', ')} } = storeToRefs(store);`);
  for (const n of [...new Set(mapFnNames)])
    setupParts.push(`const ${n} = (...args) => store.${n}(...args);`);
  if (propsDecl) setupParts.push(propsDecl);
  if (emitsDecl) setupParts.push(emitsDecl);
  for (const d of dataRefs) setupParts.push(`const ${d.name} = ref(${d.init});`);
  setupParts.push(...computedDecls);
  setupParts.push(...methodDecls);
  setupParts.push(...beforeHooks);
  setupParts.push(...watchDecls);
  setupParts.push(...hooks);
  let setupBody = setupParts.join('\n\n');

  // ---- this. 重写 ----
  const refNames = [...dataRefs.map(d => d.name), ...mapStateNames];
  const table = {};
  refNames.forEach(n => (table[n] = `${n}.value`));
  computedNames.forEach(n => (table[n] = `${n}.value`));
  methodNames.forEach(n => (table[n] = n));
  mapFnNames.forEach(n => (table[n] = n));
  propNames.forEach(n => (table[n] = `props.${n}`));

  setupBody = setupBody
    .replace(/this\.\$store\b/g, 'store')
    .replace(/this\.\$router\b/g, 'router')
    .replace(/this\.\$route\b/g, 'route')
    .replace(/this\.\$emit\(/g, 'emit(')
    .replace(/this\.\$t\(/g, '$t(')
    .replace(/this\.\$nextTick\(/g, 'nextTick(')
    .replace(/this\.\$el\b/g, 'rootEl.value')
    .replace(/this\.(\w+)/g, (m, name) => {
      if (table[name] !== undefined) return table[name];
      return m; // 未知符号留给修复循环
    });

  // $refs：先收集再替换
  const refUsages = [...new Set([...setupBody.matchAll(/this\.\$refs\.(\w+)/g)].map(m => m[1]))];
  for (const r of refUsages) {
    setupBody = setupBody.replaceAll(`this.$refs.${r}`, `${r}Ref.value`);
    table[r] = `${r}Ref.value`;
  }
  // 再跑一遍 this. 重写（$refs 展开后的残余）
  setupBody = setupBody.replace(/this\.(\w+)/g, (m, name) =>
    table[name] !== undefined ? table[name] : m
  );

  // ---- 头部 import 组装 ----
  const importLines = [];
  const vueImports = new Set(['ref']);
  if (computedDecls.length) vueImports.add('computed');
  if (watchDecls.length) vueImports.add('watch');
  if (/\$nextTick|nextTick\(/.test(setupBody)) vueImports.add('nextTick');
  if (hooks.length) {
    for (const h of hooks) {
      const m = h.match(/^(on\w+)\(/);
      if (m) vueImports.add(m[1]);
    }
  }
  for (const g of ['beforeRouteEnter', 'beforeRouteUpdate', 'beforeRouteLeave']) {
    if (hooks.some(h => h.startsWith(g + '('))) importLines.push(`import { ${guardMap(g)} } from 'vue-router';`);
  }
  if (usesStore) {
    importLines.unshift(
      `import { useStore${mapStateNames.length ? ', storeToRefs' : ''} } from '@/stores';`
    );
  }
  if (/\$t\(/.test(setupBody)) {
    importLines.push(`import { getI18n } from '@/locale';`);
    setupBody = `const $t = (...args) => getI18n().global.t(...args);\n\n` + setupBody;
  }
  if (/\$route\b|beforeRoute/.test(setupBody)) {
    importLines.push(`import { useRoute } from 'vue-router';`);
    setupBody = `const route = useRoute();\n` + setupBody;
  }
  if (/\$router\b/.test(setupBody)) {
    importLines.push(`import { useRouter } from 'vue-router';`);
    setupBody = `const router = useRouter();\n` + setupBody;
  }
  if (/rootEl\.value/.test(setupBody)) {
    setupBody = `const rootEl = ref(null);\n` + setupBody;
  }
  for (const r of refUsages) {
    setupBody = `const ${r}Ref = ref(null);\n` + setupBody;
  }

  const keepImports = src
    .slice(0, ast.program.body[0]?.start ?? 0)
    .split('\n')
    .filter(l => l.startsWith('import ') || l.startsWith('} from ') || l.startsWith('  ') === false && l.trim().startsWith('}'))
    .join('\n');
  // 简化：直接抓取原文件里所有 import 语句（含多行）
  const importRe = /import[\s\S]*?from\s+['"][^'"]+['"];?/g;
  const originalImports = (src.match(importRe) || []).filter(x => !/from 'vuex'|from '@\/stores\/helpers'/.test(x));
  const vueImportLine =
    vueImports.size > 0 ? `import { ${[...vueImports].join(', ')} } from 'vue';` : '';

  const guardImport = [];
  const routeGuards = hooks.filter(h => /^beforeRoute(Enter|Update|Leave)\(/.test(h));
  if (routeGuards.length) {
    const names = routeGuards.map(h => guardMap(h.match(/^(beforeRoute\w+)\(/)[1]));
    guardImport.push(`import { ${names.join(', ')} } from 'vue-router';`);
  }
  function guardMap(g) {
    return { beforeRouteEnter: 'onBeforeRouteEnter', beforeRouteUpdate: 'onBeforeRouteUpdate', beforeRouteLeave: 'onBeforeRouteLeave' }[g];
  }

  const header = [
    ...originalImports,
    vueImportLine,
    ...importLines.filter(l => !l.includes('useRoute') && !l.includes('useRouter')),
    ...guardImport,
  ]
    .filter(Boolean)
    .join('\n');

  const newScript = `\n${header}\n\n${setupBody.trim()}\n`;
  const newFile = raw.replace(scriptMatch[0], `<script setup lang="ts">${newScript}</script>`);

  fs.writeFileSync(file, newFile);
  converted++;
  console.log(`OK ${path.relative(root, file)}`);
}

console.log(`\nconverted: ${converted}, failed: ${failures.length}`);
failures.forEach(f => console.log('FAIL ' + f));
