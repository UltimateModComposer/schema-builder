import Ajv, { Options } from "ajv"
import _ from "lodash"
import addFormats from "ajv-formats"
import { JsonSchemaType } from "./JsonSchemaType.js"
import {
    Combine,
    DeepPartial,
    Merge,
    Overwrite,
    PartialProperties,
    Rename,
    RequiredProperties,
    TransformProperties,
    TransformPropertiesToArray,
    UnwrapArrayProperties,
    Nullable,
    OneOf,
    AllOf,
    ObjectSchemaDefinition,
} from "./TransformationTypes.js"
import { JSONSchema, JSONSchemaTypeName } from "./JsonSchema.js"
import { ThroughJsonSchema, CloneJSON, SetRequired } from "./utils.js"
import { CreatePropertyAccessor } from "./PropertyAccessor.js"
import { SchemaValidationError, VError } from "./Errors.js"
import { ObjectStringType } from "./ObjectStringType.js"

/**
 * Represents a JSON Schema and its type.
 */
export class SchemaBuilder<T> {
    /**
     * Get the JSON schema object
     */
    public get Schema() {
        return this.schemaObject
    }

    /**
     * Initialize a new SchemaBuilder instance.
     * /!\ schemaObject must not contain references. If you have references, use something like json-schema-ref-parser library first.
     */
    constructor(protected schemaObject: JSONSchema, protected validationConfig?: Options) {
        ThroughJsonSchema(this.schemaObject, (s) => {
            if ("$ref" in s) {
                throw new VError(`Schema Builder Error: $ref can't be used to initialize a SchemaBuilder. Dereferenced the schema first.`)
            }
        })
    }

    /**
     * Function that take an inline JSON schema and deduces its type automatically!
     * The schema has to be provided as a literal using `as const`
     */
    static FromJsonSchema<S>(schema: S, validationConfig?: Options) {
        return new SchemaBuilder<JsonSchemaType<S>>(schema as any, validationConfig)
    }

    /**
     * Create an empty object schema
     * AdditionalProperties is automatically set to false
     */
    static EmptySchema<N extends boolean = false>(
        schema: Pick<JSONSchema, JSONSchemaObjectProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<{} | null> : SchemaBuilder<{}> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["object", "null"] : "object",
            additionalProperties: false,
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create the schema of an object with its properties. Takes a map of properties to their schema with optional properties surrounded by brackets.
     * @example: {
     *   s: SB.stringSchema(),
     *   b: [SB.booleanSchema(), undefined]
     * }
     * => outputs type {
     *   s: string,
     *   b?: boolean
     * }
     */
    static Object<P extends { [k: string]: SchemaBuilder<any> | (SchemaBuilder<any> | undefined)[] }, N extends boolean = false>(
        schema: Pick<JSONSchema, JSONSchemaObjectProperties>,
        propertiesDefinition: P,
        nullable?: N,
    ): N extends true ? SchemaBuilder<ObjectSchemaDefinition<P> | null> : SchemaBuilder<ObjectSchemaDefinition<P>> {
        const required = [] as string[]
        const properties = {} as NonNullable<JSONSchema["properties"]>
        for (const property in propertiesDefinition) {
            const propertySchema = propertiesDefinition[property]
            if (!Array.isArray(propertySchema) || propertySchema.findIndex((e) => e === undefined) === -1) {
                required.push(property)
            }
            const filteredPropertySchema = Array.isArray(propertySchema) ? propertySchema.filter(<T>(v: T): v is NonNullable<T> => !!v) : propertySchema
            properties[property] = Array.isArray(filteredPropertySchema)
                ? filteredPropertySchema.length === 1 && filteredPropertySchema[0]
                    ? CloneJSON(filteredPropertySchema[0].Schema)
                    : {
                          anyOf: filteredPropertySchema.map((builder) => CloneJSON((builder as SchemaBuilder<any>).schemaObject)),
                      }
                : CloneJSON(filteredPropertySchema.Schema)
        }
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["object", "null"] : "object",
            ...(Object.keys(properties).length ? { properties } : {}),
            ...(required.length > 0 ? { required } : {}),
            additionalProperties: false,
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create a string schema
     */
    static String<N extends boolean = false>(
        schema: Pick<JSONSchema, JSONSchemaStringProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<string | null> : SchemaBuilder<string> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["string", "null"] : "string",
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create a number schema
     */
    static Number<N extends boolean = false>(
        schema: Pick<JSONSchema, JSONSchemaNumberProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<number | null> : SchemaBuilder<number> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["number", "null"] : "number",
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create an integer schema
     */
    static Integer<N extends boolean = false>(
        schema: Pick<JSONSchema, JSONSchemaNumberProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<number | null> : SchemaBuilder<number> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["integer", "null"] : "integer",
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create a boolean schema
     */
    static Boolean<N extends boolean = false>(
        schema: Pick<JSONSchema, JSONSchemaBooleanProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<boolean | null> : SchemaBuilder<boolean> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["boolean", "null"] : "boolean",
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create a null schema
     */
    static Null(schema: Pick<JSONSchema, JSONSchemaCommonProperties> = {}): SchemaBuilder<null> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: "null",
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create a schema that can represent any value
     */
    static Any(schema: Pick<JSONSchema, JSONSchemaCommonProperties> = {}): SchemaBuilder<any> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create a schema that can represent no value
     */
    static None(schema: Pick<JSONSchema, JSONSchemaCommonProperties> = {}): SchemaBuilder<any> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: [],
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create an enum schema
     */
    static Enum<K extends string | number | boolean | null, N extends boolean = false>(
        values: readonly K[],
        schema: Pick<JSONSchema, JSONSchemaEnumProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<K | null> : SchemaBuilder<K> {
        const types = [] as JSONSchemaTypeName[]
        for (let value of values) {
            if (typeof value === "string" && !types.find((type) => type === "string")) {
                types.push("string")
            }
            if (typeof value === "boolean" && !types.find((type) => type === "boolean")) {
                types.push("boolean")
            }
            if (typeof value === "number" && !types.find((type) => type === "number")) {
                types.push("number")
            }
        }
        if (nullable) {
            types.push("null")
        }
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: types.length === 1 ? types[0] : types,
            enum: nullable && values.findIndex((v) => v === null) === -1 ? [...values, null] : [...values],
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Create an array schema
     */
    static Array<U, N extends boolean = false>(
        items: SchemaBuilder<U>,
        schema: Pick<JSONSchema, JSONSchemaArrayProperties> = {},
        nullable?: N,
    ): N extends true ? SchemaBuilder<U[] | null> : SchemaBuilder<U[]> {
        let s: JSONSchema = {
            ...CloneJSON(schema),
            type: nullable ? ["array", "null"] : "array",
            items: CloneJSON(items.schemaObject),
        }
        return new SchemaBuilder(s) as any
    }

    /**
     * Return a schema builder which validate any one of the provided schemas exclusively. "oneOf" as described by JSON Schema specifications.
     */
    static OneOf<S extends SchemaBuilder<any>[]>(...schemaBuilders: S): SchemaBuilder<OneOf<S>> {
        return new SchemaBuilder<any>({
            oneOf: schemaBuilders.map((builder) => CloneJSON(builder.schemaObject)),
        })
    }

    /**
     * Return a schema builder which validate all the provided schemas. "allOf" as described by JSON Schema specifications.
     */
    static AllOf<S extends SchemaBuilder<any>[]>(...schemaBuilders: S): SchemaBuilder<AllOf<S>> {
        return new SchemaBuilder<any>({
            allOf: schemaBuilders.map((builder) => CloneJSON(builder.schemaObject)),
        })
    }

    /**
     * Return a schema builder which validate any number the provided schemas. "anyOf" as described by JSON Schema specifications.
     */
    static AnyOf<S extends SchemaBuilder<any>[]>(...schemaBuilders: S): SchemaBuilder<OneOf<S>> {
        return new SchemaBuilder<any>({
            anyOf: schemaBuilders.map((builder) => CloneJSON(builder.schemaObject)),
        })
    }

    /**
     * Return a schema builder which represents the negation of the given schema. The only type we can assume is "any". "not" as described by JSON Schema specifications.
     */
    static Not(schemaBuilder: SchemaBuilder<any>) {
        return new SchemaBuilder<any>({
            not: CloneJSON(schemaBuilder.schemaObject),
        })
    }

    /**
     * Make given properties optionals
     */
    SetOptionalProperties<K extends keyof T>(properties: readonly K[]): SchemaBuilder<{ [P in keyof PartialProperties<T, K>]: PartialProperties<T, K>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'setOptionalProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        const required = _.difference(schemaObject.required ?? [], properties as readonly string[])
        // clear default values for optional properties
        for (let optionalProperty of properties) {
            let property = schemaObject.properties?.[optionalProperty as string]
            if (property && typeof property !== "boolean") {
                delete property.default
            }
        }

        // delete required array if empty
        SetRequired(schemaObject, required)
        return new SchemaBuilder(schemaObject, this.validationConfig)
    }

    /**
     * Make given properties required
     */
    SetRequiredProperties<K extends keyof T>(properties: readonly K[]): SchemaBuilder<{ [P in keyof RequiredProperties<T, K>]: RequiredProperties<T, K>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'setRequiredProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        for (let property of properties) {
            schemaObject.required = schemaObject.required || []
            if (schemaObject.required.indexOf(property as string) === -1) {
                schemaObject.required.push(property as string)
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig)
    }

    /**
     * Make all properties optionals and remove their default values
     */
    ToOptionals(): SchemaBuilder<{
        [P in keyof T]?: T[P]
    }> {
        let schemaObject = CloneJSON(this.schemaObject)
        delete schemaObject.required
        // remove default values for optional properties
        for (let property in schemaObject.properties) {
            delete (schemaObject.properties[property] as JSONSchema).default
        }
        return new SchemaBuilder(schemaObject, this.validationConfig)
    }

    /**
     * Make all properties and subproperties optionals
     * Remove all default values
     */
    ToDeepOptionals(): SchemaBuilder<{ [P in keyof DeepPartial<T>]: DeepPartial<T>[P] }> {
        let schemaObject = CloneJSON(this.schemaObject)
        ThroughJsonSchema(schemaObject, (s) => {
            delete s.required
            // optional properties can't have default values
            delete s.default
        })
        return new SchemaBuilder(schemaObject, this.validationConfig)
    }

    /**
     * Make all optional properties of this schema nullable
     */
    ToNullable(): SchemaBuilder<{ [P in keyof Nullable<T>]: Nullable<T>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'toNullable' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        let required = schemaObject.required || []
        for (let propertyName in schemaObject.properties) {
            if (required.indexOf(propertyName) === -1) {
                let propertyValue = schemaObject.properties[propertyName]
                if (typeof propertyValue !== "boolean" && "type" in propertyValue) {
                    if (Array.isArray(propertyValue.type) && propertyValue.type.indexOf("null") === -1) {
                        propertyValue.type = [...propertyValue.type, "null"]
                    } else if (typeof propertyValue.type === "string" && propertyValue.type !== "null") {
                        propertyValue.type = [propertyValue.type, "null"]
                    }
                    if ("enum" in propertyValue && propertyValue.enum?.indexOf(null) === -1) {
                        propertyValue.enum = [...propertyValue.enum, null]
                    }
                } else {
                    schemaObject.properties[propertyName] = {
                        anyOf: [schemaObject.properties[propertyName], { type: "null" }],
                    }
                }
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Add a property using the given schema builder
     */
    AddProperty<U, K extends keyof any, REQUIRED extends boolean = true>(
        propertyName: K,
        schemaBuilder: SchemaBuilder<U>,
        isRequired?: REQUIRED,
    ): SchemaBuilder<{ [P in keyof Combine<T, U, K, REQUIRED, false>]: Combine<T, U, K, REQUIRED, false>[P] }> {
        if (!this.IsObjectSchema) {
            throw new VError(`Schema Builder Error: you can only add properties to an object schema`)
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        if (propertyName in schemaObject.properties) {
            throw new VError(`Schema Builder Error: '${propertyName as string}' already exists in ${schemaObject.title || "this"} schema`)
        }
        schemaObject.properties[propertyName as string] = CloneJSON(schemaBuilder.schemaObject)
        if (isRequired === true || isRequired === undefined) {
            schemaObject.required = schemaObject.required || []
            schemaObject.required.push(propertyName as string)
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Replace an existing property of this schema
     */
    ReplaceProperty<U, K extends keyof T, REQUIRED extends boolean = true>(
        propertyName: K,
        schemaBuilderResolver: SchemaBuilder<U> | ((s: SchemaBuilder<T[K]>) => SchemaBuilder<U>),
        isRequired?: REQUIRED,
    ): SchemaBuilder<{ [P in keyof Combine<Omit<T, K>, U, K, REQUIRED, false>]: Combine<Omit<T, K>, U, K, REQUIRED, false>[P] }> {
        if (!this.IsObjectSchema) {
            throw new VError(`Schema Builder Error: you can only replace properties of an object schema`)
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        if (schemaObject.required) {
            schemaObject.required = schemaObject.required.filter((p: string) => p !== propertyName)
        }
        const schemaBuilder = typeof schemaBuilderResolver === "function" ? schemaBuilderResolver(this.GetSubschema(propertyName)) : schemaBuilderResolver
        schemaObject.properties[propertyName as string] = CloneJSON(schemaBuilder.schemaObject)
        if (isRequired === true || isRequired === undefined) {
            schemaObject.required = schemaObject.required || []
            schemaObject.required.push(propertyName as string)
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Add a property or replace it if it already exists using the given schema builder
     */
    AddOrReplaceProperty<U, K extends keyof any, REQUIRED extends boolean = true>(
        propertyName: K,
        schemaBuilder: SchemaBuilder<U>,
        isRequired?: REQUIRED,
    ): SchemaBuilder<{ [P in keyof Combine<Omit<T, K>, U, K, REQUIRED, false>]: Combine<Omit<T, K>, U, K, REQUIRED, false>[P] }> {
        return this.ReplaceProperty(propertyName as any, schemaBuilder, isRequired) as any
    }

    /**
     * Add additional properties schema.
     * /!\ Many type operations can't work properly with index signatures. Try to use additionalProperties at the last step of your SchemaBuilder definition.
     * /!\ In typescript index signature MUST be compatible with other properties. However its supported in JSON schema, you can use it but you have to force the index singature to any.
     */
    AddAdditionalProperties<U = any>(schemaBuilder?: SchemaBuilder<U>): SchemaBuilder<T & { [P: string]: U }> {
        if (this.schemaObject.additionalProperties) {
            throw new VError(`Schema Builder Error: additionalProperties is already set in ${this.schemaObject.title || "this"} schema.`)
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.additionalProperties = schemaBuilder ? CloneJSON(schemaBuilder.schemaObject) : true
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Add multiple properties to the schema using the same kind of definition as `objectSchema` static method
     */
    AddProperties<P extends { [k: string]: SchemaBuilder<any> | (SchemaBuilder<any> | undefined)[] }>(
        propertiesDefinition: P,
    ): SchemaBuilder<{ [K in keyof (T & ObjectSchemaDefinition<P>)]: (T & ObjectSchemaDefinition<P>)[K] }> {
        if (!this.IsObjectSchema) {
            throw new VError(`Schema Builder Error: you can only add properties to an object schema`)
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        const propertiesIntersection = _.intersection(Object.keys(schemaObject.properties), Object.keys(propertiesDefinition))
        if (propertiesIntersection.length) {
            throw new VError(`Schema Builder Error: '${propertiesIntersection.join(", ")}' already exists in ${schemaObject.title || "this"} schema`)
        }
        for (const propertyName in propertiesDefinition) {
            const propertySchema = propertiesDefinition[propertyName]
            const filteredPropertySchema = Array.isArray(propertySchema) ? propertySchema.filter(<T>(v: T): v is NonNullable<T> => !!v) : propertySchema
            schemaObject.properties[propertyName as string] = Array.isArray(filteredPropertySchema)
                ? filteredPropertySchema.length === 1 && filteredPropertySchema[0]
                    ? CloneJSON(filteredPropertySchema[0].Schema)
                    : {
                          anyOf: filteredPropertySchema.map((builder) => CloneJSON((builder as SchemaBuilder<any>).schemaObject)),
                      }
                : CloneJSON(filteredPropertySchema.Schema)
            if (!Array.isArray(propertySchema) || propertySchema.findIndex((e) => e === undefined) === -1) {
                schemaObject.required = schemaObject.required || []
                schemaObject.required.push(propertyName as string)
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Add a string to the schema properties
     */
    AddString<K extends keyof any, REQUIRED extends boolean = true, N extends boolean = false>(
        propertyName: K,
        schema: Pick<JSONSchema, JSONSchemaStringProperties> = {},
        isRequired?: REQUIRED,
        nullable?: N,
    ): SchemaBuilder<{ [P in keyof Combine<T, string, K, REQUIRED, N>]: Combine<T, string, K, REQUIRED, N>[P] }> {
        return this.AddProperty(propertyName, SchemaBuilder.String(schema, nullable), isRequired) as any
    }

    /**
     * Add an enum to the schema properties
     */
    AddEnum<K extends keyof any, K2 extends string | boolean | number | null, REQUIRED extends boolean = true, N extends boolean = false>(
        propertyName: K,
        values: readonly K2[],
        schema: Pick<JSONSchema, JSONSchemaEnumProperties> = {},
        isRequired?: REQUIRED,
        nullable?: N,
    ): SchemaBuilder<{ [P in keyof Combine<T, K2, K, REQUIRED, N>]: Combine<T, K2, K, REQUIRED, N>[P] }> {
        return this.AddProperty(propertyName, SchemaBuilder.Enum(values, schema, nullable), isRequired) as any
    }

    /**
     * Add a number to the schema properties
     */
    AddNumber<K extends keyof any, REQUIRED extends boolean = true, N extends boolean = false>(
        propertyName: K,
        schema: Pick<JSONSchema, JSONSchemaNumberProperties> = {},
        isRequired?: REQUIRED,
        nullable?: N,
    ): SchemaBuilder<{ [P in keyof Combine<T, number, K, REQUIRED, N>]: Combine<T, number, K, REQUIRED, N>[P] }> {
        return this.AddProperty(propertyName, SchemaBuilder.Number(schema, nullable), isRequired) as any
    }

    /**
     * Add an integer to the schema properties
     */
    AddInteger<K extends keyof any, REQUIRED extends boolean = true, N extends boolean = false>(
        propertyName: K,
        schema: Pick<JSONSchema, JSONSchemaNumberProperties> = {},
        isRequired?: REQUIRED,
        nullable?: N,
    ): SchemaBuilder<{ [P in keyof Combine<T, number, K, REQUIRED, N>]: Combine<T, number, K, REQUIRED, N>[P] }> {
        return this.AddProperty(propertyName, SchemaBuilder.Integer(schema, nullable), isRequired) as any
    }

    /**
     * Add a number to the schema properties
     */
    AddBoolean<K extends keyof any, REQUIRED extends boolean = true, N extends boolean = false>(
        propertyName: K,
        schema: Pick<JSONSchema, JSONSchemaBooleanProperties> = {},
        isRequired?: REQUIRED,
        nullable?: N,
    ): SchemaBuilder<{ [P in keyof Combine<T, boolean, K, REQUIRED, N>]: Combine<T, boolean, K, REQUIRED, N>[P] }> {
        return this.AddProperty(propertyName, SchemaBuilder.Boolean(schema, nullable), isRequired) as any
    }

    /**
     * Add an array of objects to the schema properties
     */
    AddArray<U extends {}, K extends keyof any, REQUIRED extends boolean = true, N extends boolean = false>(
        propertyName: K,
        items: SchemaBuilder<U>,
        schema: Pick<JSONSchema, JSONSchemaArrayProperties> = {},
        isRequired?: REQUIRED,
        nullable?: N,
    ): SchemaBuilder<{ [P in keyof Combine<T, U[], K, REQUIRED, N>]: Combine<T, U[], K, REQUIRED, N>[P] }> {
        return this.AddProperty(propertyName, SchemaBuilder.Array(items, schema, nullable), isRequired) as any
    }

    /**
     * Rename the given property. The property schema remains unchanged.
     */
    RenameProperty<K extends keyof T, K2 extends keyof any>(
        propertyName: K,
        newPropertyName: K2,
    ): SchemaBuilder<{ [P in keyof Rename<T, K, K2>]: Rename<T, K, K2>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'renameProperty' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        if (propertyName in schemaObject.properties) {
            schemaObject.properties[newPropertyName as string] = schemaObject.properties[propertyName as string]
            delete schemaObject.properties[propertyName as string]
            // rename the property in the required array if needed
            if (schemaObject.required && schemaObject.required.indexOf(propertyName as string) !== -1) {
                schemaObject.required.splice(schemaObject.required.indexOf(propertyName as string), 1)
                schemaObject.required.push(newPropertyName as string)
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Filter the schema to contains only the given properties. additionalProperties is set to false.
     *
     * @param properties name of properties of T to keep in the result
     */
    PickProperties<K extends keyof T>(properties: readonly K[]): SchemaBuilder<{ [P in K]: T[P] }> {
        if (!this.IsObjectSchema || this.HasSchemasCombinationKeywords) {
            throw new VError(`Schema Builder Error: 'pickProperties' can only be used with a simple object schema (no oneOf, anyOf, allOf or not)`)
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        let propertiesMap: any = {}
        for (let property of properties) {
            propertiesMap[property] = schemaObject.properties[property as string]
        }
        schemaObject.properties = propertiesMap
        if (schemaObject.required) {
            schemaObject.required = schemaObject.required.filter((r: string) => (properties as readonly string[]).indexOf(r) !== -1)
        }
        if (Array.isArray(schemaObject.required) && schemaObject.required.length === 0) {
            delete schemaObject.required
        }
        schemaObject.additionalProperties = false
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Filter the schema to contains only the given properties and keep additionalProperties or part of it
     *
     * @param properties
     * @param additionalProperties [] means no additional properties are kept in the result. undefined means additionalProperties is kept or set to true if it was not set to false. ['aProperty'] allows you to capture only specific names that conform to additionalProperties type.
     */
    PickAdditionalProperties<K extends keyof T, K2 extends keyof T & string = any>(
        properties: readonly K[],
        additionalProperties?: readonly K2[],
    ): SchemaBuilder<Pick<T, K> & { [P in K2]: T[P] }> {
        if (!this.IsObjectSchema || !this.HasAdditionalProperties || this.HasSchemasCombinationKeywords) {
            throw new VError(
                `Schema Builder Error: 'pickPropertiesIncludingAdditonalProperties' can only be used with a simple object schema with additionalProperties (no oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        let additionalProps = schemaObject.additionalProperties
        schemaObject.properties = schemaObject.properties || {}
        let propertiesMap: {
            [key: string]: boolean | JSONSchema
        } = {}
        for (let property of properties) {
            propertiesMap[property as string] = schemaObject.properties[property as string]
        }
        schemaObject.properties = propertiesMap
        if (schemaObject.required) {
            schemaObject.required = schemaObject.required.filter((r: string) => (properties as readonly string[]).indexOf(r) !== -1)
        }
        if (Array.isArray(schemaObject.required) && schemaObject.required.length === 0) {
            delete schemaObject.required
        }
        if (!additionalProperties) {
            schemaObject.additionalProperties = additionalProps ? additionalProps : true
        } else if (Array.isArray(additionalProperties) && additionalProperties.length === 0) {
            schemaObject.additionalProperties = false
        } else {
            schemaObject.additionalProperties = false
            schemaObject.required = schemaObject.required || []
            if (additionalProps) {
                for (let additionalProperty of additionalProperties) {
                    schemaObject.properties[additionalProperty] = typeof additionalProps === "boolean" ? {} : CloneJSON(additionalProps)
                    schemaObject.required.push(additionalProperty)
                }
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Filter the schema to contains everything except the given properties.
     */
    OmitProperties<K extends keyof T>(properties: readonly K[]): SchemaBuilder<{ [P in keyof Omit<T, K>]: Omit<T, K>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'omitProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let p = Object.keys(this.schemaObject.properties || {}).filter((k) => (properties as readonly string[]).indexOf(k) === -1)
        return this.PickProperties(p as any)
    }

    /**
     * Transform properties to accept an alternative type. additionalProperties is set false.
     *
     * @param changedProperties properties that will have the alternative type
     * @param schemaBuilder
     */
    TransformProperties<U, K extends keyof T>(
        schemaBuilder: SchemaBuilder<U>,
        propertyNames?: readonly K[],
    ): SchemaBuilder<{ [P in keyof TransformProperties<T, K, U>]: TransformProperties<T, K, U>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'transformProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        propertyNames = propertyNames || (Object.keys(schemaObject.properties) as K[])
        for (let property of propertyNames) {
            let propertySchema = schemaObject.properties[property as string]
            schemaObject.properties[property as string] = {
                oneOf: [propertySchema, CloneJSON(schemaBuilder.schemaObject)],
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Transform the given properties to make them alternatively an array of the initial type.
     * If the property is already an Array nothing happen.
     *
     * @param propertyNames properties that will have the alternative array type
     * @param schema Array schema options to add to the transformed properties
     */
    TransformPropertiesToArray<K extends keyof T>(
        propertyNames?: readonly K[],
        schema: Pick<JSONSchema, JSONSchemaArraySpecificProperties> = {},
    ): SchemaBuilder<{ [P in keyof TransformPropertiesToArray<T, K>]: TransformPropertiesToArray<T, K>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'transformPropertiesToArray' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        propertyNames = propertyNames || (Object.keys(schemaObject.properties) as K[])
        for (let property of propertyNames) {
            let propertySchema = schemaObject.properties[property as string]
            // Transform the property if it's not an array
            if ((propertySchema as JSONSchema).type !== "array") {
                schemaObject.properties[property as string] = {
                    oneOf: [propertySchema, { type: "array", items: CloneJSON(propertySchema), ...schema }],
                }
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Unwrap the given array properties to make them alternatively the generic type of the array
     * If the property is not an Array nothing happen.
     *
     * @param propertyNames properties that will be unwrapped
     */
    UnwrapArrayProperties<K extends keyof T>(
        propertyNames?: readonly K[],
    ): SchemaBuilder<{ [P in keyof UnwrapArrayProperties<T, K>]: UnwrapArrayProperties<T, K>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'unwrapArrayProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject = CloneJSON(this.schemaObject)
        schemaObject.properties = schemaObject.properties || {}
        propertyNames = propertyNames || (Object.keys(schemaObject.properties) as K[])
        for (let property of propertyNames) {
            let propertySchema = schemaObject.properties[property as string]
            // Transform the property if it's an array
            if ((propertySchema as JSONSchema).type === "array") {
                let items = (propertySchema as JSONSchema).items
                let itemsSchema: JSONSchema
                if (Array.isArray(items)) {
                    if (items.length === 1) {
                        itemsSchema = items[0] as JSONSchema
                    } else {
                        itemsSchema = { oneOf: items }
                    }
                } else {
                    itemsSchema = items as JSONSchema
                }
                schemaObject.properties[property as string] = {
                    oneOf: [CloneJSON(itemsSchema), propertySchema],
                }
            }
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Merge all properties from the given schema into this one. If a property name is already used, a allOf statement is used.
     * This method only copy properties.
     */
    IntersectProperties<T2>(schema: SchemaBuilder<T2>): SchemaBuilder<{ [P in keyof (T & T2)]: (T & T2)[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'intersectProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject1 = CloneJSON(this.schemaObject)
        let schemaObject2 = CloneJSON(schema.schemaObject)
        if (schemaObject2.properties) {
            schemaObject1.properties = schemaObject1.properties || {}
            for (let propertyKey in schemaObject2.properties) {
                if (!(propertyKey in schemaObject1.properties)) {
                    schemaObject1.properties[propertyKey] = schemaObject2.properties[propertyKey]
                    if (schemaObject2.required && schemaObject2.required.indexOf(propertyKey) !== -1) {
                        schemaObject1.required = schemaObject1.required || []
                        schemaObject1.required.push(propertyKey)
                    }
                } else {
                    schemaObject1.properties[propertyKey] = {
                        allOf: [schemaObject1.properties[propertyKey], schemaObject2.properties[propertyKey]],
                    }
                    if (
                        schemaObject2.required &&
                        schemaObject2.required.indexOf(propertyKey) !== -1 &&
                        (!schemaObject1.required || schemaObject1.required.indexOf(propertyKey) === -1)
                    ) {
                        schemaObject1.required = schemaObject1.required || []
                        schemaObject1.required.push(propertyKey)
                    }
                }
            }
        }
        return new SchemaBuilder(schemaObject1, this.validationConfig) as any
    }

    /**
     * Merge all properties from the given schema into this one. If a property name is already used, a anyOf statement is used.
     * This method only copy properties.
     */
    MergeProperties<T2>(schema: SchemaBuilder<T2>): SchemaBuilder<{ [P in keyof Merge<T, T2>]: Merge<T, T2>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'mergeProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject1 = CloneJSON(this.schemaObject)
        let schemaObject2 = CloneJSON(schema.schemaObject)
        if (schemaObject2.properties) {
            schemaObject1.properties = schemaObject1.properties || {}
            for (let propertyKey in schemaObject2.properties) {
                if (!(propertyKey in schemaObject1.properties)) {
                    schemaObject1.properties[propertyKey] = schemaObject2.properties[propertyKey]
                    if (schemaObject2.required && schemaObject2.required.indexOf(propertyKey) !== -1) {
                        schemaObject1.required = schemaObject1.required || []
                        schemaObject1.required.push(propertyKey)
                    }
                } else {
                    schemaObject1.properties[propertyKey] = {
                        anyOf: [schemaObject1.properties[propertyKey], schemaObject2.properties[propertyKey]],
                    }
                    if (
                        schemaObject1.required &&
                        schemaObject1.required.indexOf(propertyKey) !== -1 &&
                        (!schemaObject2.required || schemaObject2.required.indexOf(propertyKey) === -1)
                    ) {
                        schemaObject1.required = schemaObject1.required.filter((p: string) => p !== propertyKey)
                    }
                }
            }
        }
        return new SchemaBuilder(schemaObject1, this.validationConfig) as any
    }

    /**
     * Overwrite all properties from the given schema into this one. If a property name is already used, the new type override the existing one.
     * This method only copy properties.
     */
    OverwriteProperties<T2>(schema: SchemaBuilder<T2>): SchemaBuilder<{ [P in keyof Overwrite<T, T2>]: Overwrite<T, T2>[P] }> {
        if (!this.IsSimpleObjectSchema) {
            throw new VError(
                `Schema Builder Error: 'overwriteProperties' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        }
        let schemaObject1 = CloneJSON(this.schemaObject)
        let schemaObject2 = CloneJSON(schema.schemaObject)
        if (schemaObject2.properties) {
            schemaObject1.properties = schemaObject1.properties || {}
            for (let propertyKey in schemaObject2.properties) {
                if (!(propertyKey in schemaObject1.properties)) {
                    schemaObject1.properties[propertyKey] = schemaObject2.properties[propertyKey]
                    if (schemaObject2.required && schemaObject2.required.indexOf(propertyKey) !== -1) {
                        schemaObject1.required = schemaObject1.required || []
                        schemaObject1.required.push(propertyKey)
                    }
                } else {
                    schemaObject1.properties[propertyKey] = schemaObject2.properties[propertyKey]
                    if (schemaObject1.required && schemaObject1.required.indexOf(propertyKey) !== -1) {
                        schemaObject1.required = schemaObject1.required.filter((r: string) => r !== propertyKey)
                    }
                    if (schemaObject2.required && schemaObject2.required.indexOf(propertyKey) !== -1) {
                        schemaObject1.required = schemaObject1.required || []
                        schemaObject1.required.push(propertyKey)
                    }
                }
            }
        }
        return new SchemaBuilder(schemaObject1, this.validationConfig) as any
    }

    /**
     * Extract a subschema of the current object schema
     */
    GetSubschema<K extends keyof T>(propertyName: K) {
        if (!this.IsSimpleObjectSchema || !this.schemaObject || typeof this.schemaObject === "boolean" || !this.schemaObject.properties) {
            throw new VError(
                `Schema Builder Error: 'getSubschema' can only be used with a simple object schema (no additionalProperties, oneOf, anyOf, allOf or not)`,
            )
        } else {
            return new SchemaBuilder<NonNullable<T[K]>>(this.schemaObject.properties[propertyName as string] as JSONSchema)
        }
    }

    /**
     * Extract the item schema of the current array schema
     */
    GetItemsSubschema() {
        if (!this.schemaObject || this.schemaObject.type !== "array" || !this.schemaObject.items || Array.isArray(this.schemaObject.items)) {
            throw new VError(`Schema Builder Error: 'getItemsSubschema' can only be used with an array schema with non-array items`)
        } else {
            return new SchemaBuilder<T extends Array<infer ITEMS> ? ITEMS : never>(this.schemaObject.items as JSONSchema)
        }
    }

    /**
     * Build a property accessor starting from this schema type
     * @returns a property accessor for the type represented by the schema
     */
    GetPropertyAccessor() {
        return CreatePropertyAccessor(this as SchemaBuilder<T>)
    }

    /**
     * true if additionalProperties is set to false and, oneOf, allOf, anyOf and not are not used
     */
    get IsSimpleObjectSchema() {
        return this.IsObjectSchema && !this.HasAdditionalProperties && !this.HasSchemasCombinationKeywords
    }

    /**
     * true if the schema represent an object
     */
    get IsObjectSchema() {
        return this.schemaObject.type === "object" || (!("type" in this.schemaObject) && "properties" in this.schemaObject)
    }

    /**
     * true if the schema represent an array
     */
    get IsArraySchema() {
        return this.schemaObject.type === "array" && !("properties" in this.schemaObject)
    }

    /**
     * True if the schema represents an objet that can have additional properties
     */
    get HasAdditionalProperties() {
        return this.IsObjectSchema && this.schemaObject.additionalProperties !== false
    }

    /**
     * True if the schema contains oneOf, allOf, anyOf or not keywords
     */
    get HasSchemasCombinationKeywords() {
        return "oneOf" in this.schemaObject || "allOf" in this.schemaObject || "anyOf" in this.schemaObject || "not" in this.schemaObject
    }

    get Properties(): string[] | null {
        if (this.IsObjectSchema && !this.HasSchemasCombinationKeywords) {
            return Object.keys(this.schemaObject.properties || {})
        }
        return null
    }

    get RequiredProperties(): string[] | null {
        if (this.IsObjectSchema && !this.HasSchemasCombinationKeywords) {
            return this.schemaObject.required ? [...this.schemaObject.required] : []
        }
        return null
    }

    get OptionalProperties(): string[] | null {
        const properties = this.Properties
        const required = this.RequiredProperties
        return properties ? properties.filter((property) => required && required.indexOf(property) === -1) : null
    }

    /**
     * change general schema attributes
     *
     * @property schema
     */
    SetSchemaAttributes(schema: Pick<JSONSchema, JSONSchemaGeneralProperties>): SchemaBuilder<{ [P in keyof T]: T[P] }> {
        let schemaObject = {
            ...CloneJSON(this.schemaObject),
            ...schema,
        }
        return new SchemaBuilder(schemaObject, this.validationConfig) as any
    }

    /**
     * Validate the given object against the schema. If the object is invalid an error is thrown with the appropriate details.
     */
    Validate(o: any): T {
        // ensure validation function is cached
        this.CacheValidationFunction()
        // run validation
        let valid = this.validationFunction(o)
        // check if an error needs to be thrown
        if (!valid) {
            throw validationError(this.ajv.errorsText(this.validationFunction.errors), this.validationFunction.errors)
        }
        return o
    }

    FromString(type: ObjectStringType, objectString: string)
    {
        switch (type)
        {
            case "JSON":
            {
                return this.Validate(JSON.stringify(objectString))
            }
            default:
            {
                throw new VError(`Invalid object string type '${type}'`)
            }
        }
    }
    protected ajv: any
    protected validationFunction: any

    /**
     * Validate the given list of object against the schema. If any object is invalid, an error is thrown with the appropriate details.
     */
    ValidateList(list: T[]) {
        // ensure validation function is cached
        this.CacheListValidationFunction()
        // run validation
        let valid = this.listValidationFunction(list)
        // check if an error needs to be thrown
        if (!valid) {
            throw validationError(this.ajvList.errorsText(this.listValidationFunction.errors), this.listValidationFunction.errors)
        }
    }
    protected ajvList: any
    protected listValidationFunction: any

    /**
     * Change the default Ajv configuration to use the given values.
     * The default validation config is { coerceTypes: false, removeAdditional: false, useDefaults: true }
     */
    ConfigureValidation(validationConfig: Options) {
        return new SchemaBuilder<T>(CloneJSON(this.schemaObject), validationConfig)
    }
    protected defaultValidationConfig = {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: true,
        strict: false,
    } as Options

    get ajvValidationConfig() {
        return {
            ...this.defaultValidationConfig,
            ...this.validationConfig,
        }
    }

    /**
     * Explicitly cache the validation function for single objects with the current validation configuration
     */
    CacheValidationFunction() {
        // prepare validation function
        if (!this.validationFunction) {
            this.ajv = new Ajv(this.ajvValidationConfig)
            addFormats(this.ajv)
            this.validationFunction = this.ajv.compile(this.schemaObject)
        }
    }
    /**
     * Explicitly cache the validation function for list of objects with the current validation configuration
     */
    CacheListValidationFunction() {
        // prepare validation function
        if (!this.listValidationFunction) {
            this.ajvList = new Ajv(this.ajvValidationConfig)
            addFormats(this.ajvList)
            this.ajvList.addSchema(this.schemaObject, "schema")
            this.listValidationFunction = this.ajvList.compile({
                type: "array",
                items: { $ref: "schema" },
                minItems: 1,
            })
        }
    }

    /**
     * @experimental This function might not handle properly all cases and its design is subject to change in the future
     *
     * Generate the typescript code equivalent of the current schema.
     * Useful when you want to generate code for an OpenAPI document while keeping the concise aspect of SchemaBuilder.
     * @param customizeOutput you can provide a function to customize or replace entirely the output for a given Schema
     * @returns The generated variable name for the schema based on its "title" and the typescript code that should produce an equivalent schema
     */
    ToTypescript(customizeOutput?: (output: string, s: SchemaBuilder<any>) => string) {
        return [this.schemaObject.title ? `${_.lowerFirst(this.schemaObject.title)}Schema` : "schema", this._toTypescript(true, customizeOutput)] as const
    }

    /**
     * Internal version of `toTypescript` used for recursion.
     * Recursive calls will have `processNamedSchema` set to `false` and will stop the recursion on any schema where the title is set.
     */
    private _toTypescript(processNamedSchema: boolean, customizeOutput: ((output: string, s: SchemaBuilder<any>) => string) | undefined): string {
        function getSchemaBuilder(schemaObject: boolean | JSONSchema | undefined): SchemaBuilder<any> {
            if (schemaObject === true || schemaObject === undefined) {
                return SchemaBuilder.Any()
            }
            if (schemaObject === false) {
                return SchemaBuilder.None()
            }
            return new SchemaBuilder(schemaObject)
        }
        function optionalStringify(obj: any, force = false, prefix = "") {
            let result = force || (obj !== undefined && Object.keys(obj).length) ? JSON.stringify(obj) : undefined
            result = result ? `${prefix}${result}` : ""
            return result
        }
        const o = customizeOutput ?? ((output: string, s: SchemaBuilder<any>) => output)
        if (!processNamedSchema && this.schemaObject.title) {
            // Named schema should be handled separately. Generate its variable name instead of its schema code.
            return o(`${_.lowerFirst(this.schemaObject.title)}Schema`, this)
        }
        let { type, ...restOfSchemaObject } = this.schemaObject
        if (type) {
            let isNull = false
            if (restOfSchemaObject.enum) {
                const { enum: enumSchemaObject, ...restOfSchemaObjectForEnum } = restOfSchemaObject
                return o(`SB.enumSchema(${JSON.stringify(enumSchemaObject)}, ${optionalStringify(restOfSchemaObjectForEnum)})`, this)
            }
            if (Array.isArray(type)) {
                if (type.length === 0) {
                    return o(`SB.neverSchema(${optionalStringify(restOfSchemaObject)})`, this)
                }
                if (type.length === 1) {
                    type = type[0]
                }
                if (Array.isArray(type) && type.length === 2 && type[0] !== "null" && type[1] === "null") {
                    type = type[0]
                    isNull = true
                }
            }
            if (!Array.isArray(type)) {
                switch (type) {
                    case "string":
                    case "boolean":
                    case "integer":
                    case "number":
                        return o(`SB.${type}Schema(${optionalStringify(restOfSchemaObject, isNull)}${isNull ? ", true" : ""})`, this)
                    case "null":
                        return o(`SB.nullSchema(${optionalStringify(restOfSchemaObject)})`, this)
                    case "array":
                        const { items, ...restOfSchemaObjectForArray } = restOfSchemaObject
                        if (Array.isArray(items)) {
                            throw new Error(`Unimplemented tuple`) // @todo fix implementation when tuple are part of SchemaBuilder methods
                        }
                        return o(
                            `SB.arraySchema(${getSchemaBuilder(items)._toTypescript(false, customizeOutput)}${optionalStringify(
                                restOfSchemaObjectForArray,
                                isNull,
                                ", ",
                            )}${isNull ? ", true" : ""})`,
                            this,
                        )
                    case "object":
                        const { properties, required, additionalProperties, ...restOfSchemaObjectForObject } = restOfSchemaObject
                        return o(
                            `SB.objectSchema(${JSON.stringify(restOfSchemaObjectForObject)}, {${Object.entries(properties ?? {})
                                .map((v) => {
                                    const propertySchemaCode = getSchemaBuilder(v[1])._toTypescript(false, customizeOutput)
                                    return `"${v[0]}": ${required?.includes(v[0]) ? propertySchemaCode : `[${propertySchemaCode}, undefined]`}`
                                })
                                .join(", ")}}${isNull ? ", true" : ""})${
                                additionalProperties
                                    ? `.addAdditionalProperties(${
                                          additionalProperties === true ? "" : getSchemaBuilder(additionalProperties)._toTypescript(false, customizeOutput)
                                      })`
                                    : ""
                            }`,
                            this,
                        )
                }
            }
        } else if (restOfSchemaObject.allOf) {
            return o(
                `SB.allOf(${restOfSchemaObject.allOf.map((schemaObject) => getSchemaBuilder(schemaObject)._toTypescript(false, customizeOutput)).join(", ")})`,
                this,
            )
        } else if (restOfSchemaObject.oneOf) {
            return o(
                `SB.oneOf(${restOfSchemaObject.oneOf.map((schemaObject) => getSchemaBuilder(schemaObject)._toTypescript(false, customizeOutput)).join(", ")})`,
                this,
            )
        } else if (restOfSchemaObject.anyOf) {
            return o(
                `SB.anyOf(${restOfSchemaObject.anyOf.map((schemaObject) => getSchemaBuilder(schemaObject)._toTypescript(false, customizeOutput)).join(", ")})`,
                this,
            )
        } else if (restOfSchemaObject.not) {
            return o(`SB.not(${getSchemaBuilder(restOfSchemaObject.not)._toTypescript(false, customizeOutput)})`, this)
        }
        // default to a literal schema for unhandled cases
        return o(`SB.fromJsonSchema(${JSON.stringify(this.schemaObject)} as const)`, this)
    }

    /**
     * This property makes the access to the underlying T type easy.
     * You can do things like type MyModel = typeof myModelSchemaBuilder.T
     * Or use GenericType["T"] in a generic type definition.
     * It's not supposed to be set or accessed
     */
    readonly T: T = null as any
}

function validationError(ajvErrorsText: string, errorsDetails: any) {
    let opt: any = {
        name: "SerafinSchemaValidationError",
        info: {
            ajvErrors: errorsDetails,
        },
    }
    return new SchemaValidationError(opt, `Invalid parameters: ${ajvErrorsText}`)
}

export type JSONSchemaCommonProperties = "title" | "description" | "default" | "examples" | "readOnly" | "writeOnly"

export type JSONSchemaArraySpecificProperties = "maxItems" | "minItems" | "uniqueItems"

export type JSONSchemaArrayProperties = JSONSchemaCommonProperties | JSONSchemaArraySpecificProperties

export type JSONSchemaStringProperties = JSONSchemaCommonProperties | "maxLength" | "minLength" | "pattern" | "format"

export type JSONSchemaNumberProperties = JSONSchemaCommonProperties | "multipleOf" | "maximum" | "exclusiveMaximum" | "minimum" | "exclusiveMinimum"

export type JSONSchemaEnumProperties = JSONSchemaCommonProperties

export type JSONSchemaBooleanProperties = JSONSchemaCommonProperties

export type JSONSchemaObjectProperties = JSONSchemaCommonProperties | "maxProperties" | "minProperties"

export type JSONSchemaGeneralProperties = JSONSchemaCommonProperties

export const SB = SchemaBuilder // shorter alias
