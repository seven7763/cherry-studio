export const relocationLocales = {
  en: {
    translation: {
      relocation: {
        title: 'Data Directory Migration',
        preparing: 'Preparing migration...',
        copying: 'Copying data...',
        committing: 'Saving new data directory...',
        failed: {
          title: 'Migration failed',
          description: 'Cherry Studio will keep using the previous data directory.'
        },
        restart_failure: 'Restart Cherry Studio',
        from: 'Current directory',
        to: 'New directory'
      }
    }
  },
  'zh-CN': {
    translation: {
      relocation: {
        title: '数据目录迁移',
        preparing: '正在准备迁移...',
        copying: '正在复制数据...',
        committing: '正在保存新的数据目录...',
        failed: {
          title: '迁移失败',
          description: 'Cherry Studio 将继续使用原数据目录。'
        },
        restart_failure: '重启 Cherry Studio',
        from: '当前目录',
        to: '新目录'
      }
    }
  },
  'zh-TW': {
    translation: {
      relocation: {
        title: '資料目錄遷移',
        preparing: '正在準備遷移...',
        copying: '正在複製資料...',
        committing: '正在儲存新的資料目錄...',
        failed: {
          title: '遷移失敗',
          description: 'Cherry Studio 將繼續使用原資料目錄。'
        },
        restart_failure: '重新啟動 Cherry Studio',
        from: '目前目錄',
        to: '新目錄'
      }
    }
  }
} as const
