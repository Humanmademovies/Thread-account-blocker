// Les minuteries d'un onglet masqué sont ralenties par Chrome (jusqu'à 1 par minute) ;
// celles d'un worker ne le sont pas. app.js s'en sert pour ses pauses entre deux blocages.
self.onmessage = ({ data: { id, ms } }) => setTimeout(() => self.postMessage({ id }), ms);
