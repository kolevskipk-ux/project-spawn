export const SUPPORT_CONSENT_VERSION = 'PP-SUPPORT-TRANSFER-0.3.3';
export const supportConsent = {
 en: 'I authorize Aztlan Engineering to transfer this message, its category, request ID, customer ID and timestamp to Discord Inc., including processing outside Mexico, so authorized Poke Primos staff can handle this support request in a private Discord channel. If I decline, I may email sales@aztlan-eng.com without losing inventory eligibility.',
 es: 'Autorizo a Aztlan Engineering a transferir este mensaje, su categoría, identificador de solicitud, identificador de cliente y fecha/hora a Discord Inc., incluido su tratamiento fuera de México, para que el personal autorizado de Poke Primos atienda esta solicitud en un canal privado de Discord. Si no acepto, puedo escribir a sales@aztlan-eng.com sin perder elegibilidad para el inventario.'
};
export function validSupportConsent(value: {version?:string; accepted?:boolean}|undefined):boolean {
 return value?.accepted===true && value.version===SUPPORT_CONSENT_VERSION;
}
