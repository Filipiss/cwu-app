# Changelog

Todas as mudanças relevantes do CWU App. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-11-03

### Adicionado
- Boost Gamer › Competitivo: monitor na taxa máxima, mouse sem aceleração e em 1:1, teste de polling rate, overlays em execução, plano Desempenho Máximo, suspensão de USB, teste de ping/jitter/perda, guia de latência por GPU e seção de mitos
- Aba Performance: monitor em tempo real com temperaturas, programas na inicialização, ajustes de jogos do Windows (Modo de Jogo, HAGS, otimização em janela, gravação do Game Bar) e diagnóstico de RAM (XMP/EXPO e dual channel)
- Aba Segurança: triagem de processos suspeitos, incluindo detecção de mineradores de criptomoedas
- Instalação em lote de softwares via winget, com fila e detecção do que já está instalado
- Prioridade de processos, na hora ou permanente
- Ponto de restauração automático antes de alterações de sistema
- Relatório do PC exportável em HTML
- Logs separados em Erros do Windows e Histórico do CWU App, com filtros
- Aviso de permissão com botão "Reiniciar como administrador"
- Tema Grafite, ícones Lucide, sub-abas e menu lateral recolhível

### Corrigido
- API local protegida: aceita apenas a própria interface (Host/Origin), ações por lista de permissão e limite de tamanho
- Dados honestos: nada de hardware, drivers ou erros inventados quando uma leitura falha
- Limpeza da Standby List medida pelos contadores do Windows e com aviso quando falta administrador
- Baixa latência NVIDIA/AMD feita pelo painel oficial (o ajuste por registro não tinha efeito)
- Monitor em tempo real que nunca iniciava a leitura
- Toasts passam a exibir as mensagens como texto puro

### Alterado
- Layout padronizado: cartões, botões, selos e espaçamentos seguem as mesmas regras em todas as abas
- O tema Clássico foi substituído pelo Grafite

## [1.0.0] - 2026-10-19

### Adicionado
- System Specs com nota de 0 a 10 por componente e nota geral do PC
- Varredura de drivers com identificação de drivers genéricos da Microsoft
- Atalhos para as páginas oficiais de drivers (NVIDIA, AMD, Intel, Realtek)
- Análise do Visualizador de Eventos com explicação de telas azuis e Kernel-Power (evento 41)
- Catálogo de softwares pós-formatação com links oficiais
- Temas Futurista e Clean Light
