/**
 * Multipart Parser
 *
 * Generic busboy wrapper for parsing multipart/form-data requests.
 * Provides a Promise-based API for file upload handling.
 */

import Busboy from 'busboy';
import { PassThrough } from 'stream';

export interface ParsedFile {
  filename: string;
  mimeType: string;
  stream: NodeJS.ReadableStream;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  file: ParsedFile | null;
}

/**
 * Parse multipart/form-data from a request stream using busboy.
 * Returns fields and file stream for processing.
 *
 * @param req - Request stream with headers property
 * @returns Promise resolving to parsed fields and file
 */
export function parseMultipartRequest(
  req: NodeJS.ReadableStream & { headers: Record<string, string> }
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: ParsedFile | null = null;

    try {
      const busboy = Busboy({ headers: req.headers });

      busboy.on('field', (fieldname: string, val: string) => {
        fields[fieldname] = val;
      });

      busboy.on(
        'file',
        (
          _fieldname: string,
          fileStream: NodeJS.ReadableStream,
          info: { filename: string; encoding: string; mimeType: string }
        ) => {
          // Create a pass-through stream to forward the file data
          const passThrough = new PassThrough();
          fileStream.pipe(passThrough);

          file = {
            filename: info.filename,
            mimeType: info.mimeType,
            stream: passThrough,
          };
        }
      );

      busboy.on('close', () => {
        resolve({ fields, file });
      });

      busboy.on('error', (err: Error) => {
        reject(err);
      });

      req.pipe(busboy);
    } catch (err) {
      reject(err);
    }
  });
}
