// Collezione dimostrativa inclusa nella pagina: viene usata SOLO come ripiego
// quando il DB di noesis-roads-creator non ha opere pubblicate ("ready").
// Le schede vere arrivano da GET /api/library (lettura del DB SQLite).
window.APP_DATA = {
  artworks: [
    {
      id: 'annunciazione-beato-angelico',
      title: 'Annunciazione',
      artist: 'Beato Angelico',
      date: 'c. 1440–1445',
      period: 'Rinascimento fiorentino',
      technique: 'Affresco',
      institution: 'Museo di San Marco, Firenze',
      location: 'Corridoio nord, Convento di San Marco',
      image: './annunciazione-beato-angelico.jpg',
      fallbackImage: 'https://commons.wikimedia.org/wiki/Special:FilePath/Fra%20Angelico%20-%20The%20Annunciation%20-%20WGA00555.jpg?width=1275',
      accent: '#c98542',
      description: 'Nel silenzio del chiostro di San Marco, l’angelo Gabriele annuncia a Maria la nascita di Gesù. Beato Angelico costruisce la scena con luce, architettura e gesti misurati, invitando chi guarda a fermarsi e osservare.',
      alt: 'L’Annunciazione del Beato Angelico: Maria e l’angelo sono seduti sotto un portico rinascimentale, illuminato da una luce chiara.',
      rights: 'Immagine fornita per uso didattico; verificare i diritti prima della pubblicazione.',
      featured: true,
      levels: ['Scuola secondaria', 'Approfondimento'],
      sources: [
        { title: 'Museo Nazionale di San Marco', type: 'Museo', url: 'https://museitoscani.cultura.gov.it/museo-di-san-marco/' },
        { title: 'Treccani — Beato Angelico', type: 'Enciclopedia', url: 'https://www.treccani.it/enciclopedia/beato-angelico/' }
      ],
      overview: { painting: 'Affrescata tra il 1438 e il 1450 nel corridoio nord del convento di San Marco a Firenze, l’Annunciazione del Beato Angelico è una delle immagini più celebri del primo Rinascimento fiorentino. La scena si svolge in una loggia aperta su un giardino chiuso: l’arcangelo Gabriele, in ginocchio, saluta Maria, che accoglie il messaggio con il braccio incrociato sul petto. La luce chiara e diffusa, lo spazio costruito con una prospettiva semplice e i colori puri — rosa, azzurro, oro — trasformano un episodio religioso in un’esperienza di silenzio e raccoglimento, accessibile anche a chi guarda senza conoscenze specifiche.', artist: 'Guido di Pietro, poi frate Giovanni da Fiesole e infine Beato Angelico (1395 ca. – 1455), fu pittore e frate domenicano. Formatosi tra miniatura e pittura su tavola, unì la devozione tardogotica alla nuova prospettiva rinascimentale appresa da Masaccio e Brunelleschi. A San Marco diresse la decorazione del convento dipingendo le celle dei frati con scene sobrie e luminose. Beatificato nel 1982, è considerato il pittore che seppe rendere visibile il divino con colori limpidi e forme semplici.' },
      overviewService: null,
      details: [
        {
          id: 'angelo-gabriele',
          title: 'L’angelo Gabriele',
          category: 'Figura',
          region: { x: 0.33, y: 0.24, width: 0.28, height: 0.58 },
          short: 'Il messaggero inginocchiato',
          insight: 'Il gesto e le ali rendono riconoscibile il messaggero divino.',
          studio: { observation: 'L’angelo è inginocchiato a sinistra, con le ali spiegate e i colori del mantello e della tunica che si distinguono dalla luce chiara del portico. Il volto è inclinato verso Maria e le mani sono raccolte in un gesto di saluto.', meaning: 'Gabriele è il messaggero che annuncia a Maria la nascita di Gesù: il suo inchino e il gesto delle mani rendono visibile il momento in cui il cielo incontra la terra.', relation: 'Il gesto di Gabriele risponde alla posa di Maria, dall’altra parte della loggia: i due movimenti si specchiano e creano il centro narrativo dell’intera scena.', lookAgain: 'Guarda le ali: nota come ogni fila di piume ha un colore diverso.' },
          approfondimento: { observation: 'L’angelo indossa una tunica rosa e un mantello azzurro, con ali multicolori dipinte a filari distinti di piume.', meaning: 'L’annuncio è il momento in cui Maria acconsente: Gabriele, con il braccio teso, rende visibile la parola che sta per essere pronunciata.', comparisons: 'Il confronto con l’Annunciazione di Simone Martini (1333, Uffizi) mostra quanto l’Angelico rinunci all’oro e al decorativismo gotico per una luce naturale e uno spazio prospettico più sobrio.', openQuestions: 'La critica discute ancora se l’affresco sia interamente autografo o se alcune parti, come le architetture, siano state eseguite da aiuti di bottega.', technique: 'Campiture piatte di tempera sull’intonaco fresco, con sottili velature per i volti e le mani; le ali sono costruite con filari di piume giustapposti, ognuno di un colore puro, senza impasto.', lookAgain: 'Guarda le ali: nota come ogni fila di piume ha un colore diverso.' }
        },
        {
          id: 'maria',
          title: 'Maria e il gesto dell’ascolto',
          category: 'Figura',
          region: { x: 0.64, y: 0.25, width: 0.3, height: 0.58 },
          short: 'La risposta di Maria',
          insight: 'La posizione composta comunica attenzione, umiltà e accettazione.',
          studio: { observation: 'Maria è seduta a destra su uno sgabello semplice, con il capo chinato e le braccia incrociate sul petto. Il mantello blu scuro copre la tunica rossa e crea un contrasto netto con la parete chiara.', meaning: 'Il braccio incrociato è il gesto tradizionale dell’accoglienza: Maria ascolta e accetta senza parole, in un’attitudine di raccoglimento che la scena intera sottolinea.', relation: 'La compostezza di Maria è il contrappunto dell’azione di Gabriele: mentre lui si muove e saluta, lei resta immobile, e da questo equilibrio nasce il senso di pace dell’opera.', lookAgain: 'Ritorna sul panneggio del mantello blu: le pieghe cadono dritte e regolari.' },
          approfondimento: { observation: 'Maria siede in un interno aperto verso il giardino; il manto blu oltremare, il libro chiuso sulle ginocchia e il nimbo sottile completano la figura.', meaning: 'La scena unisce due momenti: Maria che leggeva al momento dell’arrivo dell’angelo e Maria che acconsente con il gesto dell’umiltà.', comparisons: 'Rispetto alla Vergine dell’Annunciazione di Lorenzo Lotto (Recanati), quella dell’Angelico non è sorpresa né turbata: la sua quiete interiore è il vero soggetto della scena.', openQuestions: 'La presenza del libro e il gesto del braccio hanno generato letture diverse sul grado di consapevolezza di Maria al momento dell’annuncio.', technique: 'Il blu oltremare del manto, pigmento prezioso, è steso a campitura piana su un disegno preparatorio a sinopia; le lumeggiature del volto sono ottenute con pennellate sottili di bianco sull’intonaco fresco.', lookAgain: 'Ritorna sul panneggio del mantello blu: le pieghe cadono dritte e regolari.' }
        },
        {
          id: 'portico',
          title: 'Il portico rinascimentale',
          category: 'Composizione',
          region: { x: 0.02, y: 0.08, width: 0.96, height: 0.76 },
          short: 'Lo spazio che ordina la scena',
          insight: 'Le colonne e le arcate guidano lo sguardo verso l’incontro.',
          studio: { observation: 'Una loggia con colonne sottili e archi a tutto sesto incornicia la scena. Le pareti sono chiare e spoglie; il pavimento disegna linee prospettiche che convergono verso il centro.', meaning: 'L’architettura non è uno sfondo: costruisce uno spazio razionale e raccolto che separa la scena sacra dal mondo esterno e orienta lo sguardo verso l’incontro.', relation: 'La loggia racchiude Gabriele e Maria e si collega al giardino sullo sfondo: dentro lo spazio costruito avviene l’annuncio, fuori cresce il simbolo della purezza.', lookAgain: 'Segui con gli occhi le linee del pavimento: dove convergono?' },
          approfondimento: { observation: 'La loggia è composta da arcate sorrette da colonne con capitelli corinzi; in fondo, una finestra e un giardino recintato chiudono la profondità.', meaning: 'Lo spazio prospettico all’antica è una scelta teologica: l’architettura razionale del Rinascimento diventa la dimanda di un ordine divino che governa il mondo.', comparisons: 'La prospettiva semplificata dell’Angelico è debitrice di Brunelleschi e Masaccio, ma a differenza della Trinità di Masaccio non cerca un effetto illusionistico: resta una scena mentale e devota.', openQuestions: 'Il ritmo degli archi è stato letto come citazione dell’architettura classica o come pura invenzione: il dibattito riguarda la formazione dell’Angelico presso gli umanisti di Firenze.', technique: 'Le architetture sono eseguite con riga e filo a piombo sull’affresco, con tinte a calce stese in campiture uniformi: le ombre portate delle colonne sono appena accennate per non turbare la luminosità.', lookAgain: 'Segui con gli occhi le linee del pavimento: dove convergono?' }
        },
        {
          id: 'giardino',
          title: 'Il giardino sullo sfondo',
          category: 'Simbolo',
          region: { x: 0.05, y: 0.38, width: 0.2, height: 0.25 },
          short: 'Natura e significato',
          insight: 'Il giardino separato allude a uno spazio speciale e protetto.',
          studio: { observation: 'Oltre la loggia si vede un giardino recintato con alberi e fiori: un piccolo spazio verde, chiuso da una staccionata, che fa da sfondo alla figura di Maria.', meaning: 'Il giardino chiuso è il simbolo mariano della purezza: un luogo separato e fecondo che la tradizione associa alla Vergine e all’annuncio.', relation: 'Il giardino dialoga con la loggia: lo spazio costruito dell’annuncio si apre su uno spazio naturale recintato, e insieme incorniciano l’incontro tra Gabriele e Maria.', lookAgain: 'Conta gli alberi del giardino e osserva come sono disposti rispetto alla staccionata.' },
          approfondimento: { observation: 'Alberi stilizzati, un cespuglio fiorito e una staccionata bianca disegnano l’hortus conclusus sullo sfondo della Vergine.', meaning: 'L’hortus conclusus (Cantico dei Cantici) è una delle metafore mariane più diffuse: giardino chiuso, fonte sigillata, luogo dell’incarnazione.', comparisons: 'A differenza dei giardini fioriti del Gotico internazionale, quello dell’Angelico è ridotto all’essenziale: pochi alberi, nessun dettaglio decorativo, coerente con la sobrietà domenicana.', openQuestions: 'La flora rappresentata è stata identificata con specie simboliche (rosa, giglio) ma la resa stilizzata rende incerta l’identificazione botanica e quindi il significato esatto.', technique: 'Gli alberi sono resi con campiture di verde e bruno su cui il pittore interviene a secco per i dettagli; la staccionata è tracciata con una linea scura continua, tipica della pittura murale del tempo.', lookAgain: 'Conta gli alberi del giardino e osserva come sono disposti rispetto alla staccionata.' }
        },
        {
          id: 'luce',
          title: 'La luce chiara',
          category: 'Luce',
          region: { x: 0.08, y: 0.12, width: 0.84, height: 0.62 },
          short: 'Una luce senza forti contrasti',
          insight: 'La luminosità diffusa crea un’atmosfera calma e contemplativa.',
          studio: { observation: 'L’intera scena è immersa in una luce uniforme e chiara: non ci sono ombre profonde né bagliori improvvisi, e i colori appaiono limpidi e quasi senza peso.', meaning: 'La luce senza contrasti è la firma dell’Angelico: rende visibile la grazia, uno spazio dove nulla è minaccioso e tutto è ordinato e sereno.', relation: 'La luce avvolge portico, figure e giardino: è ciò che unifica i diversi dettagli dell’opera e li trasforma in un’unica visione pacata.', lookAgain: 'Osserva il punto più luminoso dell’affresco: cosa illumina direttamente?' },
          approfondimento: { observation: 'Fonte luminosa diffusa e costante, assenza di ombre portate evidenti, tonalità pastello su fondo chiaro: la luce non ha una direzione fisica ma una funzione simbolica.', meaning: 'La luce dell’Angelico è teologica prima che ottica: discende dall’alto e avvolge le figure senza ferirle, rendendo visibile la presenza divina nell’atto dell’annuncio.', comparisons: 'Il trattamento della luce è l’opposto di quello di Caravaggio: dove il Seicento usa il contrasto per drammatizzare, l’Angelico usa l’uniformità per contemplare; entrambi però fanno della luce il vero soggetto.', openQuestions: 'Gli studi di restauro discutono se la luminosità attuale corrisponda all’originale o sia accentuata dalle integrazioni ottocentesche delle lacune d’affresco.', technique: 'Luminosità ottenuta con l’affresco su intonaco chiarissimo e pigmenti puri stesi a campitura; le zone in ombra sono appena velate di tono più scuro, senza grafismi, per non spezzare la continuità luminosa.', lookAgain: 'Osserva il punto più luminoso dell’affresco: cosa illumina direttamente?' }
        }
      ],
      similarWorks: [
        { id: 'sim-1', title: 'Annunciazione', artist: 'Simone Martini e Lippo Memmi', date: '1333', museum: 'Galleria degli Uffizi, Firenze', caption: 'La stessa scena in stile gotico: fondo oro, figure allungate e un’iscrizione che esce dalla bocca dell’angelo.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Simone_Martini_021.jpg/320px-Simone_Martini_021.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Simone_Martini_021.jpg', imageStatus: 'ok' },
        { id: 'sim-2', title: 'Annunciazione', artist: 'Leonardo da Vinci', date: 'c. 1472–1475', museum: 'Galleria degli Uffizi, Firenze', caption: 'Leonardo sposta la scena all’aperto e studia la luce naturale e il paesaggio.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg/320px-Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Leonardo_da_Vinci_-_Annunciazione_-_Google_Art_Project.jpg', imageStatus: 'ok' }
      ]
    }
  ]
};
