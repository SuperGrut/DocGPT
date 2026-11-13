import { IsInt, IsNotEmpty, IsString, Max, Min } from "class-validator";

export class RequestUploadDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024) // the service re-checks against MAX_UPLOAD_BYTES
  sizeBytes: number;
}
