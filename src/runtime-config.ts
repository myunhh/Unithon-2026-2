import { parsePublicFrontendConfig } from './config'

export const publicFrontendConfig = parsePublicFrontendConfig(import.meta.env)
