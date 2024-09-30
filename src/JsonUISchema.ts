export interface JSONUISchema {
    uiTitle?: string
    uiDescription?: string
    uiClassNames?: string
    uiRootFieldId?: string
    uiField?: string
    uiWidget?: string
    uiStyle?: any
    uiAutoComplete?: string
    uiAutoFocus?: boolean
    uiDisabled?: boolean
    uiEnumDisabled?: string[]
    uiEnumNames?: string[]
    uiFilePreview?: boolean
    uiHelp?: string
    uiInputType?: string
    uiLabel?: boolean
    uiPlaceholder?: string
    uiReadonly?: boolean
    uiRows?: number
    uiSubmitButtonOptions?: {
        props?: JSONUISchema,
        norender?: boolean,
        submitText?: string
    },
    uiDuplicateKeySuffixSeparator?: string
}

export type JSONUISchemaCommonProperties =
      'uiTitle'
    | 'uiDescription'
    | 'uiClassNames'
    | 'uiRootFieldId'
    | 'uiField'
    | 'uiWidget'
    | 'uiStyle'
    | 'uiAutoComplete'
    | 'uiAutoFocus'
    | 'uiDisabled'
    | 'uiFilePreview'
    | 'uiHelp'
    | 'uiLabel'
    | 'uiReadonly'
    | 'uiDuplicateKeySuffixSeparator'

export type JSONUISchemaObjectProperties = JSONUISchemaCommonProperties
    | 'uiSubmitButtonOptions'

export type JSONUISchemaStringProperties = JSONUISchemaCommonProperties
    | 'uiInputType'
    | 'uiPlaceholder'
    | 'uiRows'

export type JSONUISchemaNumberProperties = JSONUISchemaCommonProperties
export type JSONUISchemaBooleanProperties = JSONUISchemaCommonProperties
export type JSONUISchemaArrayProperties = JSONUISchemaCommonProperties
export type JSONUISchemaAnyProperties = JSONUISchemaCommonProperties
export type JSONUISchemaEnumProperties = JSONUISchemaCommonProperties
    | 'uiEnumDisabled'
    | 'uiEnumNames'

export function SplitUISchema<T>(schema: object): [T,any] {
    const schemaOut: any = {}
    const uiSchemaOut: any = {}
    const renameUIField = (field: string) =>
        `ui:${field.substring(2,3).toLowerCase()}${field.substring(3)}`

    for (let [key,value] of Object.entries(schema)) {
        if (key.startsWith('ui')) {
            if (key === 'uiSubmitButtonOptions' && value.props !== undefined) {
                for (const [propKey, propValue] of Object.entries(value.props)) {
                    value.props[renameUIField(propKey)] = propValue
                    delete value.props[propKey]
                }
            }
            uiSchemaOut[renameUIField(key)] = value
        }
        else
        {
            schemaOut[key] = value
        }
    }

    return [schemaOut,uiSchemaOut]
}