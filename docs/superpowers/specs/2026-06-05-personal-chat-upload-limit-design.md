# Personal Chat Upload Limit Design

## Goal

Allow only the account with email `andrey1689123@gmail.com` to upload chat files up to `30 GB` while keeping existing configured limits for all other users.

## Approach

The backend remains the source of truth. `ChatFilesController` will load the authenticated user record by `currentUser.UserId`, compare the stored email case-insensitively, and apply a personal upload limit when it matches. Other users continue to use `ChatFiles:MaxFileSizeBytes` and `ChatFiles:MaxUserStorageBytes`.

The personal limit also raises the effective user storage quota to at least `30 GB`, so one allowed file is not blocked by the default `5 GB` storage quota. Request body limits continue to be derived from the effective per-request file limit plus multipart overhead.

## Frontend

The renderer and Electron attachment picker currently reject files above `500 MB` before the server sees them. Raise the client-side chat file picker/send limit to `30 GB` so the personal account can select and send large files. The server still rejects oversized uploads for all non-personal accounts.

## Error Handling

Existing upload errors stay intact. When a non-personal user exceeds the configured backend limit, the server response reports the effective limit through `FormatBytes(limits.MaxFileSizeBytes)`.

## Testing

Add backend controller tests that verify:

- `andrey1689123@gmail.com` receives a `30 GB` max file limit and a storage quota of at least `30 GB`.
- Other users keep configured/default limits.

Update the frontend source policy test to expect a `30 GB` chat file policy in the renderer and Electron attachment picker.
