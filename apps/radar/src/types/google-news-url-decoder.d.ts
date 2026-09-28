declare module "google-news-url-decoder" {
  export type DecodeResult = { status: boolean; decoded_url: string; message?: string };
  export class GoogleDecoder {
    decode(url: string): Promise<DecodeResult>;
    decodeBatch(urls: string[]): Promise<DecodeResult[]>;
  }
}
