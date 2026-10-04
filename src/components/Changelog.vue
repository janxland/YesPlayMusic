<template>
  <div class="changelog">
    <div class="title-row">
      <div class="title">{{ title }}</div>
      <div class="subtitle"
        >共 {{ list.length }} 个版本 · 数据源 src/utils/changelog.js</div
      >
    </div>
    <div v-for="(entry, i) in list" :key="i" class="release">
      <div class="release-head">
        <span class="version">{{ entry.version }}</span>
        <span class="branch">{{ entry.branch }}</span>
        <span class="date">{{ entry.date }}</span>
      </div>
      <div class="summary">{{ entry.summary }}</div>
      <div v-for="(item, j) in entry.items" :key="j" class="item">
        <span class="tag" :class="item.type">{{
          typeLabels[item.type] || item.type
        }}</span>
        <span class="text">{{ item.text }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import changelogEntries from '@/utils/changelog';

export default {
  name: 'Changelog',
  props: {
    title: { type: String, default: '更新日志' },
    entries: { type: Array, default: null },
  },
  data() {
    return {
      typeLabels: {
        feat: '新功能',
        fix: '修复',
        perf: '性能',
        refactor: '重构',
        chore: '清理',
        ci: '构建',
        docs: '文档',
      },
    };
  },
  computed: {
    list() {
      return this.entries || changelogEntries;
    },
  },
};
</script>

<style lang="scss" scoped>
.changelog {
  .title-row {
    margin-bottom: 18px;
    .title {
      font-size: 22px;
      font-weight: 700;
      color: var(--color-text);
    }
    .subtitle {
      font-size: 12px;
      color: var(--color-text);
      opacity: 0.5;
      margin-top: 4px;
    }
  }

  .release {
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 14px;
  }

  .release-head {
    display: flex;
    align-items: center;
    gap: 10px;
    .version {
      font-size: 16px;
      font-weight: 700;
      color: var(--color-text);
    }
    .branch {
      font-size: 11px;
      font-family: 'SFMono-Regular', Consolas, monospace;
      color: var(--color-primary);
      background: var(--color-primary-bg-for-transparent);
      border-radius: 5px;
      padding: 2px 7px;
    }
    .date {
      margin-left: auto;
      font-size: 12px;
      color: var(--color-text);
      opacity: 0.5;
    }
  }

  .summary {
    font-size: 13px;
    color: var(--color-text);
    opacity: 0.75;
    margin: 6px 0 10px;
  }

  .item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
    .tag {
      flex: none;
      font-size: 11px;
      font-weight: 700;
      border-radius: 5px;
      padding: 1px 7px;
      color: #fff;
      &.feat {
        background: #2ecc71;
      }
      &.fix {
        background: #e74c3c;
      }
      &.perf {
        background: #f39c12;
      }
      &.refactor {
        background: #9b59b6;
      }
      &.chore {
        background: #95a5a6;
      }
      &.ci {
        background: #3498db;
      }
      &.docs {
        background: #1abc9c;
      }
    }
    .text {
      font-size: 13.5px;
      color: var(--color-text);
      line-height: 1.6;
    }
  }
}
</style>
