/**
 * 用于读取环境变量中的配置
 */
import { Kind, Modifier, TObject, TSchema } from '@sinclair/typebox';

// 配置一些类型简化代码
type PrimitiveTypes = string | number | boolean;
interface ConfigObject {
  [k: string]: PrimitiveTypes | ConfigObject | (PrimitiveTypes | ConfigObject)[];
}
type ConfigValue = ConfigObject['key'];
function isTObject(schema: TSchema): schema is TObject {
  return schema[Kind] === 'Object';
}
function isConfigObject(config: ConfigValue): config is ConfigObject {
  return typeof config === 'object' && !Array.isArray(config);
}

// 封装传入配置获取环境变量中的配置
export function getConfigFromEnv<T>(configType: TObject, split = '__', prefix = ''): T {
  const envKeys = convertToEnvKey(configType, split, prefix);
  const envConfig = getEnvByKeys(envKeys);
  const configTemp = convertToConfig(envConfig, split, prefix);
  const config = convertConfigType(configTemp, configType);
  return config as T;
}

// 将配置类型转换环境变量对应的key
function convertToEnvKey(config: TObject, split: string, prefix: string): string[] {
  return flattenToEnvKey(config, split).map((it) => prefix + it);
}

// 递归将配置扁平化
function flattenToEnvKey(config: TObject, split: string): string[] {
  const keys: string[] = [];
  for (const key in config.properties) {
    const value = config.properties[key];
    if (isTObject(value)) {
      keys.push(...flattenToEnvKey(value, split).map((it) => key + split + it.toUpperCase()));
    } else {
      keys.push(key.toUpperCase());
    }
  }
  return keys;
}

// 获取环境变量对应的值
function getEnvByKeys(keys: Readonly<string[]>): Record<string, string> {
  const result: Record<string, string> = {};
  keys.forEach((key) => {
    if (process.env[key]) {
      result[key] = process.env[key] as string;
    }
  });

  return result;
}

// 将环境变量的值立体化转换成config
function convertToConfig(envConfig: Readonly<Record<string, string>>, split: string, prefix: string): ConfigObject {
  const quoteReg = /^(?<quote>'|")(?<content>.*)\k<quote>$/;
  let config: ConfigObject = {};
  for (let key in envConfig) {
    let value = envConfig[key];
    // 去除头尾多余引号
    value = value.replace(quoteReg, '$<content>');
    // 去除前缀
    if (key.startsWith(prefix)) {
      key = key.substring(prefix.length);
    }
    key = key.toLowerCase();
    const configKeys = key.split(split);
    const singleConfig = configKeys.reduceRight((prev, k) => ({ [k]: prev }), value as unknown);
    config = mergeObj(config, singleConfig as ConfigObject);
  }
  return config;
}

// 合并对象
function mergeObj(def: ConfigObject, obj: ConfigObject) {
  if (!obj) {
    return def;
  } else if (!def) {
    return obj;
  }
  for (const i in obj) {
    // if its an object
    const value = obj[i];
    if (value != null && isConfigObject(value)) {
      def[i] = mergeObj(def[i] as ConfigObject, value);
    } else {
      def[i] = value;
    }
  }
  return def;
}

// 转换类型
function convertType(value: string, type: string): ConfigValue {
  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return Boolean(value);
    case 'array':
      return JSON.parse(value) as Array<PrimitiveTypes | ConfigObject>;
    default:
      return value;
  }
}

// 将config内的类型强转成与传入配置类型
function convertConfigType(config: ConfigObject, configType: TObject): ConfigValue {
  for (const key in configType.properties) {
    const typeValue = configType.properties[key];
    let configValue: ConfigObject | PrimitiveTypes | (ConfigObject | PrimitiveTypes)[];
    if (typeValue[Modifier]=='Optional' || typeValue['default']) {
        if (config[key]) {
            configValue = config[key];
        } else {
            continue;
        }
    } else {
        configValue = config[key];
    }
    if (isTObject(typeValue)) {
      if (typeof configValue === 'string') {
        configValue = JSON.parse(configValue) as ConfigObject;
      }
      configValue = convertConfigType(configValue as ConfigObject, typeValue);
    } else if (typeof configValue === 'string' && configType.properties[key][Kind] !== 'String') {
      configValue = convertType(configValue, configType.properties[key][Kind].toLowerCase());
    }
    config[key] = configValue;
  }
  return config;
}
