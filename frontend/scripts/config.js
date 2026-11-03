// frontend/scripts/config.js
// Dados públicos do projeto Supabase (Project Settings › API).
// A chave "anon" é feita para ficar no app: quem protege os dados são as regras RLS
// do banco (supabase/schema.sql). Nunca coloque aqui a chave "service_role".
window.CWU_CONFIG = Object.freeze({
  supabaseUrl: '',      // ex.: https://abcdefgh.supabase.co
  supabaseAnonKey: ''
});
