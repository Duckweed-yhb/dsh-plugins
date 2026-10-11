import { describe, expect, it, vi } from 'vitest'
import { MAX_PANEL_ACTIONS, normalizePanelAction, PanelActionRegistry } from './panel-actions.ts'

/**
 * The hover-panel action registry (issue #6). Registration validates the
 * shape a plugin hands the pet service, the table stays ordered and bounded,
 * and a click dispatches to the registering plugin's own callback.
 */

describe('normalizePanelAction', () => {
  it('accepts a registration with the documented shape', () => {
    expect(normalizePanelAction({ id: 'pet-quota-swap', label: '换装' })).toEqual({
      id: 'pet-quota-swap',
      label: '换装',
      order: 0,
    })
  })

  it('carries the optional tooltip and order the plugin declared', () => {
    expect(normalizePanelAction({ id: 'swap', label: '换装', title: '切换到下一只宠物', order: -5 }))
      .toEqual({ id: 'swap', label: '换装', title: '切换到下一只宠物', order: -5 })
  })

  it('rejects an id a click could not be dispatched back on', () => {
    for (const id of [undefined, '', 'Swap', 'pet quota', '../escape', 'a'.repeat(65)]) {
      expect(normalizePanelAction({ id, label: '换装' })).toBeUndefined()
    }
  })

  it('rejects a registration with no label and truncates an over-long one', () => {
    expect(normalizePanelAction({ id: 'swap', label: '   ' })).toBeUndefined()
    expect(normalizePanelAction({ id: 'swap' })).toBeUndefined()
    expect(normalizePanelAction({ id: 'swap', label: 'x'.repeat(80) })?.label).toBe('x'.repeat(24))
  })

  it('ignores unknown fields and a non-numeric order', () => {
    expect(normalizePanelAction({ id: 'swap', label: '换装', order: 'first', evil: true }))
      .toEqual({ id: 'swap', label: '换装', order: 0 })
  })
})

describe('PanelActionRegistry', () => {
  it('serves the registered actions and dispatches a click to the plugin', async () => {
    const registry = new PanelActionRegistry()
    const onSelect = vi.fn()
    registry.register({ id: 'swap', label: '换装', onSelect })

    expect(registry.views()).toEqual([{ id: 'swap', label: '换装', order: 0 }])
    await expect(registry.select('swap', { petId: 'whale-girl' })).resolves.toBe(true)
    expect(onSelect).toHaveBeenCalledWith({ petId: 'whale-girl' })
  })

  it('reports an unregistered id instead of invoking anything', async () => {
    const registry = new PanelActionRegistry()
    const onSelect = vi.fn()
    registry.register({ id: 'swap', label: '换装', onSelect })

    await expect(registry.select('other', { petId: 'whale-girl' })).resolves.toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('lets a later registration of the same id replace the earlier one', async () => {
    const registry = new PanelActionRegistry()
    const first = vi.fn()
    const second = vi.fn()
    registry.register({ id: 'swap', label: '换装', onSelect: first })
    registry.register({ id: 'swap', label: '更衣', onSelect: second })

    await registry.select('swap', { petId: 'whale-girl' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(registry.views()).toEqual([{ id: 'swap', label: '更衣', order: 0 }])
  })

  it('keeps the replacing registration when the superseded one disposes', async () => {
    // The trap this guards: a hot-reloaded plugin disposes its old
    // registration after the new one is in, and the naive "delete by id"
    // disposer would take the live action with it.
    const registry = new PanelActionRegistry()
    const disposeFirst = registry.register({ id: 'swap', label: '换装', onSelect: vi.fn() })
    registry.register({ id: 'swap', label: '更衣', onSelect: vi.fn() })

    disposeFirst()
    expect(registry.views().map(view => view.label)).toEqual(['更衣'])
  })

  it('reclaims the action when the registering plugin disposes it', async () => {
    const registry = new PanelActionRegistry()
    const dispose = registry.register({ id: 'swap', label: '换装', onSelect: vi.fn() })

    dispose()
    expect(registry.views()).toEqual([])
    await expect(registry.select('swap', { petId: 'whale-girl' })).resolves.toBe(false)
    // Disposing twice is the shape an effect re-run produces; it is a no-op.
    expect(() => dispose()).not.toThrow()
  })

  it('renders the registered block in order, ties on id', () => {
    const registry = new PanelActionRegistry()
    registry.register({ id: 'b', label: 'B', order: 1, onSelect: vi.fn() })
    registry.register({ id: 'a', label: 'A', order: 1, onSelect: vi.fn() })
    registry.register({ id: 'c', label: 'C', order: 0, onSelect: vi.fn() })

    expect(registry.views().map(view => view.id)).toEqual(['c', 'a', 'b'])
  })

  it('refuses a malformed registration where it was written', () => {
    const registry = new PanelActionRegistry()
    expect(() => registry.register({ label: '换装', onSelect: vi.fn() })).toThrow(/invalid panel action/)
    expect(() => registry.register({ id: 'swap', label: '换装' })).toThrow(/onSelect/)
  })

  it('bounds the row so plugins cannot grow it without limit', () => {
    const registry = new PanelActionRegistry()
    for (let index = 0; index < MAX_PANEL_ACTIONS; index += 1) {
      registry.register({ id: 'swap-' + index, label: '换装', onSelect: vi.fn() })
    }
    expect(registry.views()).toHaveLength(MAX_PANEL_ACTIONS)
    expect(() => registry.register({ id: 'swap-overflow', label: '换装', onSelect: vi.fn() })).toThrow(/limit/)
    // Re-registering an id that is already in the row is not a new row.
    expect(() => registry.register({ id: 'swap-0', label: '换装', onSelect: vi.fn() })).not.toThrow()
  })

  it('propagates a failing callback so the caller can report it', async () => {
    const registry = new PanelActionRegistry()
    registry.register({ id: 'swap', label: '换装', onSelect: () => { throw new Error('plugin bug') } })

    await expect(registry.select('swap', { petId: 'whale-girl' })).rejects.toThrow('plugin bug')
  })
})
