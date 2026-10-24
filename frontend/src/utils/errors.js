// Turns an axios error (or anything else) into one readable message.
// The backend sends { message } for single errors and { errors: [...] }
// for validation failures; both are handled here.
export function getErrorMessage(error) {
  const data = error?.response?.data;
  if (data?.errors?.length) {
    return data.errors.map((e) => `${e.field}: ${e.message}`).join(' · ');
  }
  if (data?.message) return data.message;
  if (error?.message === 'Network Error') {
    return 'Cannot reach the backend — is it running on port 5000?';
  }
  return 'Something went wrong, please try again.';
}
