/// <reference types="vite/client" />

/**
 * Vite 环境类型声明
 */

// CSS 模块声明
declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}
