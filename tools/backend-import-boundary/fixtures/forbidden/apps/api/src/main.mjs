import { desktopRuntime } from '../../../electron/main.mjs'
import { rendererApp } from '../../../src/App.tsx'

export const forbidden = [desktopRuntime, rendererApp]
