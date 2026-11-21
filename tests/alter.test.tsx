import { expect, test } from 'claude-code/testing'

const pane = (placement: 'widget' | 'dock') => ({
  plugin: 'alter',
  component: 'Pane',
  requestId: 'alter',
  surface: 'desktop',
  props: {
    title: 'Alter', isFocused: false, bodyColumns: 40, placement,
    scroll: { offset: 0, bodyRows: 30 }, view: {},
  },
} as const)

test('le widget montre Alter prêt, la vue complète ses raccourcis', async ($, on) => {
  on('command.register', () => ({ value: { command: 'alter' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const w = await $.ui.mount(pane('widget'))
  expect((await w.find({ type: 'Text', text: 'Prêt' }))?.text).toBe('Prêt')
  await w.unmount()

  const d = await $.ui.mount(pane('dock'))
  expect(await d.find({ type: 'Button', key: 'point' })).toBeTruthy()
  expect(await d.find({ type: 'Button', key: 'marc' })).toBeTruthy()
  await d.unmount()
})
