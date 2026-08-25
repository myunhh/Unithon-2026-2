export class ImportBoundaryConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ImportBoundaryConfigurationError'
  }
}
