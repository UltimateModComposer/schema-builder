/** Tracks schema validation details */
export class SchemaValidationError extends Error {
    constructor(public options: any, message: string) {
        super(message)
    }
}

/** Replacement for VError for use in browser (currently breaks api) */
export class VError extends Error {}
