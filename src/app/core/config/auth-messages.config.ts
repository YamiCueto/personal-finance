/**
 * Mensajes centralizados en español para el subsistema de autenticación.
 */
export const AUTH_MESSAGES = {
  SYSTEM_BADGE: 'Control Financiero Personal',
  ERRORS: {
    INVALID_CREDENTIALS: 'Correo o contraseña incorrectos. Por favor verifica tus credenciales.',
    EMAIL_NOT_CONFIRMED: 'Por favor confirma tu correo electrónico antes de ingresar.',
    USER_ALREADY_EXISTS: 'Ya existe una cuenta registrada con este correo electrónico.',
    WEAK_PASSWORD: 'La contraseña debe tener al menos 8 caracteres y contener letras y números.',
    RATE_LIMIT: 'Límite de solicitudes alcanzado. Por favor espera unos momentos antes de reintentar.',
    NETWORK_ERROR: 'No fue posible conectar con el servicio de autenticación. Por favor verifica tu conexión de red.',
    GENERIC_FAILURE: 'Error en la solicitud de autenticación. Por favor intenta nuevamente.',
    RECOVERY_EXPIRED: 'El enlace de recuperación es inválido o ha expirado. Por favor solicita un nuevo enlace.',
    PASSWORDS_MISMATCH: 'Las contraseñas no coinciden.',
    EMAIL_REQUIRED: 'El correo electrónico es requerido.',
    EMAIL_INVALID: 'Ingresa un formato de correo electrónico válido.',
    PASSWORD_REQUIRED: 'La contraseña es requerida.',
    PASSWORD_CONFIRM_REQUIRED: 'Por favor confirma tu contraseña.',
    PASSWORD_MINLENGTH: 'La contraseña debe tener al menos 8 caracteres.',
    PASSWORD_STRENGTH: 'La contraseña debe incluir al menos una letra y un número.',
  },
  SUCCESS: {
    LOGIN: 'Sesión iniciada correctamente.',
    SIGNUP_IMMEDIATE: '¡Cuenta registrada exitosamente! Bienvenido a tu bóveda personal.',
    SIGNUP_CONFIRMATION: '¡Registro iniciado! Te hemos enviado un correo de confirmación. Por favor verifica tu dirección para activar tu bóveda.',
    PASSWORD_RECOVERY_SENT: 'Si existe una cuenta asociada a este correo, se han enviado las instrucciones de recuperación. Por favor revisa tu bandeja de entrada o spam.',
    PASSWORD_UPDATED: '¡Contraseña maestra actualizada exitosamente! Redirigiendo al inicio de sesión...',
  },
} as const;
