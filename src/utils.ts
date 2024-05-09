import { JSONSchema } from "./JsonSchema.js"

/**
 * Like a forEach but deeply on each JsonSchema it founds
 */
export function ThroughJsonSchema(schema: JSONSchema | JSONSchema[], action: (schema: JSONSchema) => void) {
    if (Array.isArray(schema)) {
        schema.forEach((s) => {
            ThroughJsonSchema(s, action)
        })
    } else {
        const type = typeof schema
        if (schema == null || type != "object") {
            return
        }
        action(schema)
        if (schema.properties) {
            for (let property in schema.properties) {
                ThroughJsonSchema(schema.properties[property] as JSONSchema, action)
            }
        }
        if (schema.oneOf) {
            schema.oneOf.forEach((s) => ThroughJsonSchema(s as JSONSchema[], action))
        }
        if (schema.allOf) {
            schema.allOf.forEach((s) => ThroughJsonSchema(s as JSONSchema[], action))
        }
        if (schema.anyOf) {
            schema.anyOf.forEach((s) => ThroughJsonSchema(s as JSONSchema[], action))
        }
        if (schema.items) {
            ThroughJsonSchema(schema.items as JSONSchema, action)
        }
        if (schema.not) {
            ThroughJsonSchema(schema.not as JSONSchema, action)
        }
        if (schema.additionalProperties && typeof schema.additionalProperties !== "boolean") {
            ThroughJsonSchema(schema.additionalProperties, action)
        }
    }
    return schema
}

/**
 * Utility method to deep clone JSON objects
 */
export function CloneJSON<T>(o: T): T {
    if (typeof o !== "object" || o === null) {
        return o
    }
    if (Array.isArray(o)) {
        return (o as any).map(CloneJSON)
    }
    const r = {} as T
    for (const key in o) {
        r[key] = CloneJSON(o[key])
    }
    return r
}

/**
 * Helper to set required field properly
 */
export function SetRequired(schema: JSONSchema, required: string[]) {
    if (!required || required.length === 0) {
        delete schema.required
    } else {
        schema.required = required
    }
}
