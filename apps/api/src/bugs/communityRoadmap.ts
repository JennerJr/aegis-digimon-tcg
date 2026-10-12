import { RoadmapStage } from "@aegis/shared/feedback/RoadmapStage";
import type { CommunityRoadmap } from "@aegis/shared/feedback/roadmapTypes";

export const communityRoadmap: CommunityRoadmap = {
  reviewedAt: "2026-10-12",
  items: [
    {
      id: "ranked-leaderboard",
      stage: RoadmapStage.PLANNED.value,
      title: { en: "Ranked / Leaderboard", "pt-BR": "Ranked / Leaderboard", es: "Ranked / Leaderboard" },
      description: {
        en: "Enable ranked matchmaking and a seasonal leaderboard once match reliability is ready. Ranked is currently disabled.",
        "pt-BR":
          "Liberar partidas ranqueadas e um leaderboard por temporada quando as partidas estiverem estáveis. Ranked está desativado por enquanto.",
        es: "Habilitar partidas clasificatorias y una clasificación por temporada cuando las partidas sean estables. Ranked está desactivado por ahora.",
      },
      discordUrls: [
        "https://discord.com/channels/1525646227608178798/1556079380667830374",
        "https://discord.com/channels/1525646227608178798/1557810820010745867",
      ],
      websiteRequests: 1,
    },
    {
      id: "friends",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Friends and match invitations",
        "pt-BR": "Amigos e convites para partidas",
        es: "Amigos e invitaciones a partidas",
      },
      description: {
        en: "Find players, add friends and invite them to play or watch a match.",
        "pt-BR": "Buscar jogadores, adicionar amigos e convidá-los para jogar ou assistir a uma partida.",
        es: "Buscar jugadores, añadir amigos e invitarlos a jugar o ver una partida.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1558289067412824074"],
      websiteRequests: 1,
    },
    {
      id: "sandbox",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Sandbox and combo simulation",
        "pt-BR": "Sandbox e simulação de combos",
        es: "Sandbox y simulación de combos",
      },
      description: {
        en: "Set up both boards, hands, security and memory to test combos, deck ratios and matchups.",
        "pt-BR": "Configurar campos, mãos, segurança e memória para testar combos, proporções do deck e confrontos.",
        es: "Configurar campos, manos, seguridad y memoria para probar combos, proporciones del mazo y enfrentamientos.",
      },
      discordUrls: [
        "https://discord.com/channels/1525646227608178798/1559112543673516063",
        "https://discord.com/channels/1525646227608178798/1558155497297813624",
      ],
      websiteRequests: 0,
    },
    {
      id: "replay-annotations",
      stage: RoadmapStage.IDEA.value,
      title: { en: "Replay annotations", "pt-BR": "Anotações nos replays", es: "Anotaciones en replays" },
      description: {
        en: "Mark key moments and add notes to existing replays for study and content creation.",
        "pt-BR":
          "Marcar momentos importantes e adicionar notas aos replays existentes para estudo e criação de conteúdo.",
        es: "Marcar momentos importantes y añadir notas a los replays existentes para estudiar y crear contenido.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1558829093900918794"],
      websiteRequests: 0,
    },
    {
      id: "deck-guides",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Community deck guides",
        "pt-BR": "Guias nos decks da comunidade",
        es: "Guías en mazos de la comunidad",
      },
      description: {
        en: "Let deck authors explain combos, matchups and card choices alongside their decklists.",
        "pt-BR": "Permitir que autores expliquem combos, confrontos e escolhas de cartas junto das listas de decks.",
        es: "Permitir que los autores expliquen combos, enfrentamientos y elecciones de cartas junto a sus listas.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1558194570511261746"],
      websiteRequests: 0,
    },
    {
      id: "deck-cost-filters",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "More precise deckbuilder filters",
        "pt-BR": "Filtros mais precisos no deckbuilder",
        es: "Filtros más precisos en el constructor",
      },
      description: {
        en: "Filter exact play costs above 7 and digivolution costs. Card-text search is already available.",
        "pt-BR":
          "Filtrar custos exatos de jogo acima de 7 e custos de digievolução. A busca por texto das cartas já está disponível.",
        es: "Filtrar costes exactos de juego superiores a 7 y costes de digievolución. La búsqueda por texto ya está disponible.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1557756793835356373"],
      websiteRequests: 0,
    },
    {
      id: "custom-profile-image",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Custom profile images",
        "pt-BR": "Imagens personalizadas no perfil",
        es: "Imágenes personalizadas de perfil",
      },
      description: {
        en: "Upload a profile image; choosing built-in avatars or restoring the Discord image is already available.",
        "pt-BR":
          "Enviar uma imagem própria para o perfil; escolher avatares do catálogo ou restaurar a imagem do Discord já é possível.",
        es: "Subir una imagen propia de perfil; elegir avatares del catálogo o restaurar la imagen de Discord ya es posible.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1557182641747398776"],
      websiteRequests: 0,
    },
    {
      id: "korean-card-images",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Korean card images",
        "pt-BR": "Imagens coreanas das cartas",
        es: "Imágenes coreanas de las cartas",
      },
      description: {
        en: "Offer Korean card art and printed card text. Korean interface translations are already available.",
        "pt-BR": "Oferecer imagens e texto impresso das cartas em coreano. A interface em coreano já está disponível.",
        es: "Ofrecer imágenes y texto impreso de cartas en coreano. La interfaz en coreano ya está disponible.",
      },
      discordUrls: [],
      websiteRequests: 1,
    },
    {
      id: "timer-alert",
      stage: RoadmapStage.IDEA.value,
      title: { en: "Low-time notification", "pt-BR": "Aviso de tempo restante", es: "Aviso de tiempo restante" },
      description: {
        en: "Add an explicit low-time notification beyond the existing timer color change.",
        "pt-BR":
          "Adicionar uma notificação explícita de pouco tempo além da mudança de cor já existente no cronômetro.",
        es: "Añadir una notificación explícita de poco tiempo además del cambio de color del temporizador.",
      },
      discordUrls: [],
      websiteRequests: 1,
    },
    {
      id: "post-match-decks",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Opponent decklists after a match",
        "pt-BR": "Deck do oponente após a partida",
        es: "Mazo del rival tras la partida",
      },
      description: {
        en: "Explore sharing the opponent decklist after a finished match. Inspecting and copying your own deck is already available.",
        "pt-BR":
          "Explorar a consulta ao deck do oponente após uma partida concluída. Consultar e copiar o próprio deck já é possível.",
        es: "Explorar consultar el mazo del rival tras una partida terminada. Consultar y copiar el propio mazo ya es posible.",
      },
      discordUrls: [],
      websiteRequests: 1,
    },
    {
      id: "blocking-prompt",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Clearer blocking decisions",
        "pt-BR": "Decisões de bloqueio mais claras",
        es: "Decisiones de bloqueo más claras",
      },
      description: {
        en: "Make choosing to block or pass easier to understand and harder to confuse.",
        "pt-BR": "Deixar a escolha entre bloquear e passar mais clara para evitar cliques por engano.",
        es: "Aclarar la elección entre bloquear y pasar para evitar clics equivocados.",
      },
      discordUrls: [],
      websiteRequests: 1,
    },
    {
      id: "action-log",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Clearer action logs and notifications",
        "pt-BR": "Logs e notificações mais claros",
        es: "Registros y notificaciones más claros",
      },
      description: {
        en: "Improve card and zone names, turn markers and log search; keep notifications from covering the board.",
        "pt-BR":
          "Melhorar nomes de cartas e zonas, marcações de turno e busca no log; evitar que notificações cubram o campo.",
        es: "Mejorar nombres de cartas y zonas, marcas de turno y búsqueda en el registro; evitar que los avisos tapen el campo.",
      },
      discordUrls: [
        "https://discord.com/channels/1525646227608178798/1558153801050103933",
        "https://discord.com/channels/1525646227608178798/1557089244793667674",
        "https://discord.com/channels/1525646227608178798/1559050238248099922",
      ],
      websiteRequests: 0,
    },
    {
      id: "board-readability",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Easier inherited effects and DP reading",
        "pt-BR": "Leitura de herdados e DP mais fácil",
        es: "Lectura más fácil de heredados y DP",
      },
      description: {
        en: "Make inherited effects easier to reach and base DP versus bonus DP easier to read.",
        "pt-BR": "Facilitar o acesso aos efeitos herdados e a leitura do DP base e dos bônus.",
        es: "Facilitar el acceso a efectos heredados y la lectura del DP base y sus bonificaciones.",
      },
      discordUrls: [
        "https://discord.com/channels/1525646227608178798/1558237639352520806",
        "https://discord.com/channels/1525646227608178798/1558236990112141423",
      ],
      websiteRequests: 0,
    },
    {
      id: "music-shortcut",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Quick music controls",
        "pt-BR": "Atalho para controlar a música",
        es: "Controles rápidos de música",
      },
      description: {
        en: "Change the current music directly from the main menu.",
        "pt-BR": "Trocar a música atual diretamente pelo menu principal.",
        es: "Cambiar la música actual directamente desde el menú principal.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1557855650787360798"],
      websiteRequests: 0,
    },
    {
      id: "digilab-integration",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Digilab profile integration",
        "pt-BR": "Integração de perfil com o Digilab",
        es: "Integración de perfiles con Digilab",
      },
      description: {
        en: "Explore linking Digilab profiles and using matchup data with the community.",
        "pt-BR": "Explorar a conexão de perfis do Digilab e o uso de dados de confrontos com a comunidade.",
        es: "Explorar la conexión de perfiles de Digilab y el uso de datos de enfrentamientos con la comunidad.",
      },
      discordUrls: [
        "https://discord.com/channels/1525646227608178798/1557786882396389506",
        "https://discord.com/channels/1525646227608178798/1557810820010745867",
      ],
      websiteRequests: 0,
    },
    {
      id: "bot-strategy",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Stronger practice bot strategies",
        "pt-BR": "Estratégias melhores para o bot",
        es: "Mejores estrategias del bot de práctica",
      },
      description: {
        en: "Explore stronger deck-specific bot pilots and reusable strategy guides. Choosing the bot deck is already available.",
        "pt-BR":
          "Explorar pilotos de bot melhores por deck e guias de estratégia reutilizáveis. Escolher o deck do bot já é possível.",
        es: "Explorar mejores pilotos del bot por mazo y guías de estrategia reutilizables. Elegir el mazo del bot ya es posible.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1558155884717412632"],
      websiteRequests: 0,
    },
    {
      id: "device-handoff",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Continue a match on another device",
        "pt-BR": "Continuar a partida em outro dispositivo",
        es: "Continuar una partida en otro dispositivo",
      },
      description: {
        en: "Move an active match between desktop and mobile with a deliberate session handoff.",
        "pt-BR": "Transferir uma partida em andamento entre computador e celular com troca controlada de sessão.",
        es: "Transferir una partida activa entre ordenador y móvil con un cambio controlado de sesión.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1556896819622187049"],
      websiteRequests: 0,
    },
    {
      id: "season-rewards",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Seasonal cosmetic rewards",
        "pt-BR": "Recompensas cosméticas por temporada",
        es: "Recompensas cosméticas por temporada",
      },
      description: {
        en: "Explore cosmetic rewards and season records separately from enabling ranked play.",
        "pt-BR": "Explorar recompensas cosméticas e registros de temporadas além da liberação de Ranked.",
        es: "Explorar recompensas cosméticas y registros de temporadas además de habilitar Ranked.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1557810820010745867"],
      websiteRequests: 0,
    },
    {
      id: "ruling-feedback",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Better ruling and bug-report guidance",
        "pt-BR": "Orientações melhores para regras e reports",
        es: "Mejor orientación sobre reglas e informes",
      },
      description: {
        en: "Use usability feedback and judge-reviewed examples to help distinguish expected rulings from bugs.",
        "pt-BR":
          "Usar feedback de usabilidade e exemplos revisados por juízes para distinguir regras esperadas de bugs.",
        es: "Usar comentarios de usabilidad y ejemplos revisados por jueces para distinguir reglas esperadas de errores.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1558995509899821186"],
      websiteRequests: 0,
    },
    {
      id: "development-feedback",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Feedback on AI use in development",
        "pt-BR": "Feedback sobre uso de IA no desenvolvimento",
        es: "Comentarios sobre el uso de IA en desarrollo",
      },
      description: {
        en: "Discuss the request to change how AI is used in the creation of the project.",
        "pt-BR": "Discutir o pedido de mudança no uso de IA na criação do projeto.",
        es: "Debatir la petición de cambiar el uso de IA en la creación del proyecto.",
      },
      discordUrls: [],
      websiteRequests: 1,
    },
    {
      id: "art-picker",
      stage: RoadmapStage.IDEA.value,
      title: {
        en: "Faster alternate-art selection",
        "pt-BR": "Seleção de artes alternativas mais rápida",
        es: "Selección más rápida de artes alternativas",
      },
      description: {
        en: "Open art choices from the card preview and simplify applying an art to all copies.",
        "pt-BR": "Abrir a seleção de artes pela prévia da carta e simplificar a aplicação da arte a todas as cópias.",
        es: "Abrir la selección de arte desde la vista previa y simplificar aplicarla a todas las copias.",
      },
      discordUrls: ["https://discord.com/channels/1525646227608178798/1558854349688537189"],
      websiteRequests: 0,
    },
  ],
};
