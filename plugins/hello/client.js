/**
 * hello 插件的浏览器半区（Web UI 侧）。
 *
 * 这是 DSH 期望的“已打包浏览器模块”格式：注册一个惰性工厂进
 * window.__ModuleLoader__，工厂的 id 必须等于包名。React 来自浏览器的模块表，
 * 不需要（也不允许）自己安装或引入其他 Harness 客户端包。
 *
 * 手写这个格式的代价是：这里不能写 JSX、不能 import，所有注册都放在 apply 里，
 * 并返回清理函数交给 ctx.effect / 槽位所有者回收。
 */
window.__ModuleLoader__.load({
  id: '@yhb/dsh-plugin-hello',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** 这个插件拥有的词典命名空间。 */
    const NS = 'yhb.hello';
    /** 槽位里的条目 id：用自己的 id 才会和官方条目并排新增，不会顶掉它们。 */
    const ROW_ID = 'yhb-hello';

    /** 简体中文文案。 */
    const zh = {
      badge: '插件工坊已就绪',
      hint: '来自 @yhb/dsh-plugin-hello',
    };
    /** English copy. */
    const en = {
      badge: 'Plugin workshop ready',
      hint: 'from @yhb/dsh-plugin-hello',
    };

    /** 只使用 Theme 令牌清单里的颜色，亮/暗主题自动跟随。 */
    const styles = {
      container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        paddingTop: '4px',
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      dot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: 'var(--dsw-alias-state-success-primary)',
        flex: 'none',
      },
      hint: {
        color: 'var(--dsw-alias-label-primary)',
      },
    };

    /**
     * 输入框下方的一行小徽标。
     *
     * @param props - 槽位注入的 props，其中 t 是词典翻译函数。
     */
    function HelloBadge({ t }) {
      return h(
        'div',
        { style: styles.container },
        h('span', { style: styles.dot, 'aria-hidden': true }),
        h('span', null, t('badge')),
        h('span', { style: styles.hint }, t('hint')),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yhb-hello: dictionaries');

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: ROW_ID,
              order: 5,
              locale: NS,
            },
            // 槽位会带来自己的 t（若提供）；否则退回词典服务的 bind 结果。
            (props) => h(HelloBadge, { t: typeof props?.t === 'function' ? props.t : t }),
          ));
      },
    };
  },
});
