import { describe, expect, it } from 'bun:test'
import { withCodexHomeSetup } from '../src/core/codex-runner/codex-home-setup'

describe('@ankole/agent-computer Codex Home setup', () => {
  it('serializes one Agent Home without blocking a different Agent', async () => {
    const order: string[] = []
    let releaseFirst = (): void => undefined
    let markFirstStarted = (): void => undefined
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>(resolve => {
      markFirstStarted = resolve
    })

    const first = withCodexHomeSetup('/agents/alpha/.codex', async () => {
      order.push('alpha-1-start')
      markFirstStarted()
      await firstGate
      order.push('alpha-1-end')
    })
    await firstStarted

    const second = withCodexHomeSetup('/agents/alpha/.codex', async () => {
      order.push('alpha-2')
    })
    await withCodexHomeSetup('/agents/beta/.codex', async () => {
      order.push('beta')
    })
    expect(order).toEqual(['alpha-1-start', 'beta'])

    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['alpha-1-start', 'beta', 'alpha-1-end', 'alpha-2'])
  })

  it('releases the next setup after a failure', async () => {
    await expect(
      withCodexHomeSetup('/agents/failure/.codex', async () => {
        throw new Error('setup failed')
      })
    ).rejects.toThrow('setup failed')

    await expect(withCodexHomeSetup('/agents/failure/.codex', async () => 'recovered')).resolves.toBe('recovered')
  })

  it('rejects promptly on abort while queued behind a prior setup', async () => {
    let releaseFirst = (): void => undefined
    let markFirstStarted = (): void => undefined
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>(resolve => {
      markFirstStarted = resolve
    })

    const first = withCodexHomeSetup('/agents/abort/.codex', async () => {
      markFirstStarted()
      await firstGate
      return 'first-done'
    })
    await firstStarted

    const controller = new AbortController()
    const queued = withCodexHomeSetup(
      '/agents/abort/.codex',
      async () => 'should-not-run',
      controller.signal
    )

    controller.abort(new Error('job stopped'))
    await expect(queued).rejects.toThrow('job stopped')

    releaseFirst()
    await expect(first).resolves.toBe('first-done')
  })

  it('rejects immediately when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('pre-aborted'))

    await expect(
      withCodexHomeSetup('/agents/pre-abort/.codex', async () => 'nope', controller.signal)
    ).rejects.toThrow('pre-aborted')
  })
})
