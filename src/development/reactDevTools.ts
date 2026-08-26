export async function initializeReactDevTools(): Promise<void> {
  if (!import.meta.env.DEV) return

  await Promise.all([
    import('react-grab'),
    import('react-scan').then(({ scan }) => {
      scan({ enabled: true })
    }),
  ])
}
