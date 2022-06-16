import { FileStats, StorageOptions } from '..';

export interface Converter<T extends string = any, K extends string = any> {
  from: T[]
  to: K[]
  load: (extension: T, buffer: Buffer) => Buffer | Promise<Buffer>;
}

export interface ConverterManagerInterface<T extends Converter[]> {
  convert: (
    extension: ConvertableStatus<T>,
    stats: FileStats
  ) => Buffer | Promise<Buffer> | undefined | Promise<undefined>;
}

export type ConvertableStatus<T> = T extends Converter[]
  ? T[number]['to'][number]
  : T extends StorageOptions ? ConvertableStatus<T['converters']> : never