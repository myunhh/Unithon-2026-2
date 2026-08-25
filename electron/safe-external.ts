/** Fire-and-forget external navigation without allowing OS integration errors to escape as unhandled rejections. */
export function openExternalSafely(openExternal: (url: string) => Promise<void>, url: string): void {
  void openExternal(url).catch(() => undefined)
}
