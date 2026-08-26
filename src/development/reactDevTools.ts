export async function initializeReactDevTools(): Promise<void> {
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_REACT_DEVTOOLS !== 'true') return

  await Promise.all([
    import('react-grab'),
    import('react-scan').then(({ scan }) => {
      scan({ enabled: true })
    }),
  ])
}
