/** Keep temporary service failures distinct from a rejected password. */
export function loginErrorMessage(error: { code?: string; status?: number; name?: string }): string {
  if (error.code === 'invalid_credentials') {
    return 'Correo o contraseña incorrectos. Por favor, verificá tus datos.';
  }
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Hubo demasiados intentos. Esperá unos minutos antes de volver a ingresar.';
  }
  if ((error.status || 0) >= 500 || error.name === 'AuthRetryableFetchError') {
    return 'El servicio de acceso está demorando o no está disponible. Volvé a intentar en unos momentos.';
  }
  return 'No se pudo iniciar sesión. Volvé a intentar; si continúa, contactá a administración.';
}
