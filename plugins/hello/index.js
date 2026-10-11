/**
 * hello 插件的 Host 半区（Node 侧）。
 *
 * 这个插件只做浏览器侧的渲染，Host 侧没有要注册的服务或工具，所以 apply 里
 * 只留一条启动痕迹，用来在日志里确认这一行确实被 Loader 挂载了。
 *
 * 约定：Host 半区只导出 apply（外加可选的 inject / Config），不要和默认导出混用；
 * 所有资源都要在 apply 内用 ctx.effect / ctx.on 注册并返回清理函数。
 */

/** 行 id，与 cordis.patch.yml 里声明的 id 保持一致，便于日志定位。 */
const ROW_ID = 'yhb-hello';

/**
 * Host 侧的挂载入口。
 *
 * @param ctx - Cordis 插件上下文。
 */
export function apply(ctx) {
  // ctx.logger 不一定存在（取决于宿主），用可选调用兜底。
  ctx.logger?.info?.(`[${ROW_ID}] host half mounted; the browser half renders conversation.composer.dock`);
}
