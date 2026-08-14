/**
 * Photos staged on a create form and posted with the same save (field-ops).
 * Upload still goes through prepare → finalize after the owner row exists.
 */

export const CREATE_PHOTO_FIELD = 'photos';
export const MAX_CREATE_PHOTOS = 8;

export function isStagedCreatePhoto(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0 && value.name.trim().length > 0;
}

export function collectCreatePhotoFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const value of formData.getAll(CREATE_PHOTO_FIELD)) {
    if (!isStagedCreatePhoto(value)) continue;
    files.push(value);
    if (files.length >= MAX_CREATE_PHOTOS) break;
  }
  return files;
}
