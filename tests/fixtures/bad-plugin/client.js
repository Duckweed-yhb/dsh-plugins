/**
 * 反面样本（浏览器半区）：故意不写成 ModuleLoader 工厂、id 与包名不一致、
 * require 被禁用的 Harness 客户端包、并且直接操作 document.body。
 */
const React = require('react')
const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

window.__ModuleLoader__.load({
  id: '@yhb/some-other-name',
  factory() {
    document.body.appendChild(document.createElement('div'))
    return { apply() {} }
  },
})

export default { React, primitives }
