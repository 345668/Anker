/** A refusal or failure from a generation provider. `status` is the provider's HTTP status; 4xx means nothing was run. */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
