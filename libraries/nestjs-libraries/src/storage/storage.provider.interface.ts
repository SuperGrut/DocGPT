export interface UploadFileInput {
  key: string;
  buffer: Buffer;
  contentType: string;
}

export interface StoredFile {
  key: string;
  size: number;
}

export interface StorageProviderInterface {
  readonly name: string;

  upload(input: UploadFileInput): Promise<StoredFile>;

  download(key: string): Promise<Buffer>;

  delete(key: string): Promise<void>;
}
