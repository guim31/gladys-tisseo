// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, states, action messages,
// widget contents, scene outputs), in the four languages of the Gladys
// interface. Entries are strings or functions of one parameter object.
// German says "du", Spanish "usted". Brand and place names never translate.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names (frozen when the device is created, in the configured language).
export const NAMES = {
  en: {
    metro: 'Metro',
    tram: 'Tram',
    bus: 'Bus',
    following: '(next)',
    board: 'Next departures',
    traffic: 'Traffic info',
    bikes: 'Bikes available',
    mechanical: 'Mechanical bikes',
    electric: 'Electric bikes',
    docks: 'Free docks',
  },
  fr: {
    metro: 'Métro',
    tram: 'Tram',
    bus: 'Bus',
    following: '(suivant)',
    board: 'Prochains passages',
    traffic: 'Info trafic',
    bikes: 'Vélos disponibles',
    mechanical: 'Vélos mécaniques',
    electric: 'Vélos électriques',
    docks: 'Places libres',
  },
  de: {
    metro: 'Metro',
    tram: 'Tram',
    bus: 'Bus',
    following: '(danach)',
    board: 'Nächste Abfahrten',
    traffic: 'Verkehrsinfo',
    bikes: 'Verfügbare Räder',
    mechanical: 'Mechanische Räder',
    electric: 'E-Bikes',
    docks: 'Freie Stellplätze',
  },
  es: {
    metro: 'Metro',
    tram: 'Tranvía',
    bus: 'Bus',
    following: '(siguiente)',
    board: 'Próximas salidas',
    traffic: 'Info de tráfico',
    bikes: 'Bicicletas disponibles',
    mechanical: 'Bicicletas mecánicas',
    electric: 'Bicicletas eléctricas',
    docks: 'Anclajes libres',
  },
};

// Texts of the published states, of the widgets and of the scene outputs.
export const TEXT = {
  en: {
    noDisruption: 'No disruption',
    noDeparture: 'No departure in the next 24 hours',
    nothingAt: ({ stop }) => `${stop}: no departure in the next 24 hours`,
    scheduled: 'scheduled',
    now: 'now',
    in: ({ minutes }) => `in ${minutes} min`,
    inTwo: ({ first, second }) => `in ${first} and ${second} min`,
    nowThen: ({ second }) => `now, then in ${second} min`,
    sentence: ({ line, direction, stop, when }) =>
      `${line} towards ${direction} at ${stop}: ${when}`,
    legend: '≈ timetable, otherwise real time',
    disrupted: ({ count }) => `${count} disruption(s) on these lines`,
    loading: 'The Tisséo timetable is loading: try again in a minute.',
    pickStop: 'Choose a stop in the settings of this widget.',
    pickStation: 'No station yet: add one in the configuration of the Tisséo integration.',
    gone: 'This stop is no longer watched by the integration.',
    mechanicalShort: 'mech.',
    electricShort: 'elec.',
    docksShort: 'docks',
    outOfService: 'Out of service',
    unavailable: 'Data unavailable for now',
    bikeSentence: ({ name, bikes, mechanical, electric, docks }) =>
      `${name}: ${bikes} bike(s) (${mechanical} mechanical, ${electric} electric), ${docks} free dock(s).`,
    outOfServiceNote: ' (out of service)',
  },
  fr: {
    noDisruption: 'Aucune perturbation',
    noDeparture: 'Aucun passage dans les 24 h',
    nothingAt: ({ stop }) => `${stop} : aucun passage dans les 24 h`,
    scheduled: 'théorique',
    now: 'maintenant',
    in: ({ minutes }) => `dans ${minutes} min`,
    inTwo: ({ first, second }) => `dans ${first} et ${second} min`,
    nowThen: ({ second }) => `maintenant, puis dans ${second} min`,
    sentence: ({ line, direction, stop, when }) => `${line} vers ${direction} à ${stop} : ${when}`,
    legend: '≈ horaire théorique, sinon temps réel',
    disrupted: ({ count }) => `${count} perturbation(s) sur ces lignes`,
    loading: 'Les horaires Tisséo sont en cours de chargement : réessayez dans une minute.',
    pickStop: 'Choisissez un arrêt dans les réglages de ce widget.',
    pickStation:
      "Aucune station pour l'instant : ajoutez-en une dans la configuration de l'intégration Tisséo.",
    gone: "Cet arrêt n'est plus surveillé par l'intégration.",
    mechanicalShort: 'méca',
    electricShort: 'élec',
    docksShort: 'places',
    outOfService: 'Hors service',
    unavailable: 'Données indisponibles pour le moment',
    bikeSentence: ({ name, bikes, mechanical, electric, docks }) =>
      `${name} : ${bikes} vélo(s) (${mechanical} mécanique(s), ${electric} électrique(s)), ${docks} place(s) libre(s).`,
    outOfServiceNote: ' (hors service)',
  },
  de: {
    noDisruption: 'Keine Störung',
    noDeparture: 'Keine Abfahrt in den nächsten 24 Stunden',
    nothingAt: ({ stop }) => `${stop}: keine Abfahrt in den nächsten 24 Stunden`,
    scheduled: 'laut Fahrplan',
    now: 'jetzt',
    in: ({ minutes }) => `in ${minutes} Min.`,
    inTwo: ({ first, second }) => `in ${first} und ${second} Min.`,
    nowThen: ({ second }) => `jetzt, dann in ${second} Min.`,
    sentence: ({ line, direction, stop, when }) =>
      `${line} Richtung ${direction} ab ${stop}: ${when}`,
    legend: '≈ laut Fahrplan, sonst Echtzeit',
    disrupted: ({ count }) => `${count} Störung(en) auf diesen Linien`,
    loading: 'Der Tisséo-Fahrplan wird geladen: Versuch es in einer Minute noch einmal.',
    pickStop: 'Wähle eine Haltestelle in den Einstellungen dieses Widgets.',
    pickStation: 'Noch keine Station: Füge eine in der Konfiguration der Tisséo-Integration hinzu.',
    gone: 'Diese Haltestelle wird von der Integration nicht mehr überwacht.',
    mechanicalShort: 'mech.',
    electricShort: 'E-Bike',
    docksShort: 'frei',
    outOfService: 'Außer Betrieb',
    unavailable: 'Daten derzeit nicht verfügbar',
    bikeSentence: ({ name, bikes, mechanical, electric, docks }) =>
      `${name}: ${bikes} Rad/Räder (${mechanical} mechanisch, ${electric} elektrisch), ${docks} freie(r) Stellplatz/Stellplätze.`,
    outOfServiceNote: ' (außer Betrieb)',
  },
  es: {
    noDisruption: 'Sin incidencias',
    noDeparture: 'Ninguna salida en las próximas 24 horas',
    nothingAt: ({ stop }) => `${stop}: ninguna salida en las próximas 24 horas`,
    scheduled: 'horario teórico',
    now: 'ahora',
    in: ({ minutes }) => `dentro de ${minutes} min`,
    inTwo: ({ first, second }) => `dentro de ${first} y ${second} min`,
    nowThen: ({ second }) => `ahora, luego dentro de ${second} min`,
    sentence: ({ line, direction, stop, when }) => `${line} hacia ${direction} en ${stop}: ${when}`,
    legend: '≈ horario teórico; si no, tiempo real',
    disrupted: ({ count }) => `${count} incidencia(s) en estas líneas`,
    loading: 'Los horarios de Tisséo se están cargando: vuelva a intentarlo en un minuto.',
    pickStop: 'Elija una parada en los ajustes de este widget.',
    pickStation: 'Aún no hay estaciones: añada una en la configuración de la integración Tisséo.',
    gone: 'La integración ya no vigila esta parada.',
    mechanicalShort: 'mec.',
    electricShort: 'eléc.',
    docksShort: 'libres',
    outOfService: 'Fuera de servicio',
    unavailable: 'Datos no disponibles por ahora',
    bikeSentence: ({ name, bikes, mechanical, electric, docks }) =>
      `${name}: ${bikes} bicicleta(s) (${mechanical} mecánica(s), ${electric} eléctrica(s)), ${docks} anclaje(s) libre(s).`,
    outOfServiceNote: ' (fuera de servicio)',
  },
};

// Messages of the configuration actions.
export const REPORTS = {
  en: {
    loading:
      'The Tisséo timetable is still loading (15 MB on the first start, about a minute). Try again in a moment.',
    gtfsFailed: ({ reason }) =>
      `The Tisséo timetable could not be downloaded (${reason}). Try again later.`,
    gbfsFailed: ({ reason }) => `The VélôToulouse stations could not be read (${reason}).`,
    noQuery:
      'Type a name, or set the position of your home in Gladys (Settings → Houses) to list the closest ones.',
    noMatch: ({ query }) => `Nothing matches "${query}".`,
    foundStops: ({ count }) => `${count} stop(s) found:`,
    closestStops: ({ house }) => `Closest stops to ${house}:`,
    foundStations: ({ count }) => `${count} station(s) found:`,
    closestStations: ({ house }) => `Closest stations to ${house}:`,
    addStopHint: 'To watch one, run "Add a stop" with its name or its identifier (SA_…).',
    addStationHint: 'To watch one, run "Add a bike station" with its name or its number.',
    ambiguous: ({ query }) => `Several matches for "${query}": add it by its identifier.`,
    stopAdded: ({ name, lines }) => `${name} added (${lines}).`,
    stopUpdated: ({ name, lines }) => `${name} updated (${lines}).`,
    allLines: 'all lines',
    unknownLines: ({ lines, available }) =>
      `No such line at this stop: ${lines}. Lines here: ${available}.`,
    stationAdded: ({ name }) => `${name} added.`,
    stationKnown: ({ name }) => `${name} is already watched.`,
    toDiscovery: 'Open the Discover tab to create its device.',
    removed: ({ name }) => `${name} removed from the list. Delete its device in Gladys if needed.`,
    notWatched: ({ query }) => `Nothing watched is named "${query}" or has this identifier.`,
    tooMany: ({ max }) => `The list is full (${max} at most).`,
    watchedStops: ({ count }) => `Watched stops: ${count}`,
    watchedStations: ({ count }) => `Watched bike stations: ${count}`,
    timetable: ({ date, until }) => `Timetable: downloaded on ${date}, departures until ${until}.`,
    timetableMissing: 'Timetable: not downloaded yet.',
    realtime: ({ age, tracked }) =>
      `Real time: updated ${age} s ago, ${tracked} vehicle(s) tracked on the network.`,
    realtimeOff: 'Real time: turned off in the configuration (timetable only).',
    realtimeWaiting: 'Real time: not read yet.',
    bikes: ({ age }) => `VélôToulouse: updated ${age} s ago.`,
    bikesWaiting: 'VélôToulouse: not read yet.',
    lastError: ({ error }) => `Last error: ${error}`,
  },
  fr: {
    loading:
      'Les horaires Tisséo sont encore en cours de chargement (15 Mo au premier démarrage, une minute environ). Réessayez dans un instant.',
    gtfsFailed: ({ reason }) =>
      `Les horaires Tisséo n'ont pas pu être téléchargés (${reason}). Réessayez plus tard.`,
    gbfsFailed: ({ reason }) => `Les stations VélôToulouse n'ont pas pu être lues (${reason}).`,
    noQuery:
      'Saisissez un nom, ou renseignez la position de votre maison dans Gladys (Paramètres → Maisons) pour lister les plus proches.',
    noMatch: ({ query }) => `Rien ne correspond à « ${query} ».`,
    foundStops: ({ count }) => `${count} arrêt(s) trouvé(s) :`,
    closestStops: ({ house }) => `Arrêts les plus proches de ${house} :`,
    foundStations: ({ count }) => `${count} station(s) trouvée(s) :`,
    closestStations: ({ house }) => `Stations les plus proches de ${house} :`,
    addStopHint:
      'Pour en surveiller un, lancez « Ajouter un arrêt » avec son nom ou son identifiant (SA_…).',
    addStationHint:
      'Pour en surveiller une, lancez « Ajouter une station vélo » avec son nom ou son numéro.',
    ambiguous: ({ query }) =>
      `Plusieurs résultats pour « ${query} » : ajoutez-le par son identifiant.`,
    stopAdded: ({ name, lines }) => `${name} ajouté (${lines}).`,
    stopUpdated: ({ name, lines }) => `${name} mis à jour (${lines}).`,
    allLines: 'toutes les lignes',
    unknownLines: ({ lines, available }) =>
      `Ligne(s) absente(s) de cet arrêt : ${lines}. Lignes desservies : ${available}.`,
    stationAdded: ({ name }) => `${name} ajoutée.`,
    stationKnown: ({ name }) => `${name} est déjà surveillée.`,
    toDiscovery: "Ouvrez l'onglet Découverte pour créer son appareil.",
    removed: ({ name }) =>
      `${name} retiré de la liste. Supprimez son appareil dans Gladys si besoin.`,
    notWatched: ({ query }) =>
      `Rien de surveillé ne s'appelle « ${query} » ni n'a cet identifiant.`,
    tooMany: ({ max }) => `La liste est pleine (${max} au plus).`,
    watchedStops: ({ count }) => `Arrêts surveillés : ${count}`,
    watchedStations: ({ count }) => `Stations vélo surveillées : ${count}`,
    timetable: ({ date, until }) =>
      `Horaires : téléchargés le ${date}, passages connus jusqu'au ${until}.`,
    timetableMissing: 'Horaires : pas encore téléchargés.',
    realtime: ({ age, tracked }) =>
      `Temps réel : mis à jour il y a ${age} s, ${tracked} véhicule(s) suivi(s) sur le réseau.`,
    realtimeOff: 'Temps réel : désactivé dans la configuration (horaires théoriques seuls).',
    realtimeWaiting: 'Temps réel : pas encore lu.',
    bikes: ({ age }) => `VélôToulouse : mis à jour il y a ${age} s.`,
    bikesWaiting: 'VélôToulouse : pas encore lu.',
    lastError: ({ error }) => `Dernière erreur : ${error}`,
  },
  de: {
    loading:
      'Der Tisséo-Fahrplan wird noch geladen (15 MB beim ersten Start, etwa eine Minute). Versuch es gleich noch einmal.',
    gtfsFailed: ({ reason }) =>
      `Der Tisséo-Fahrplan konnte nicht heruntergeladen werden (${reason}). Versuch es später noch einmal.`,
    gbfsFailed: ({ reason }) =>
      `Die VélôToulouse-Stationen konnten nicht gelesen werden (${reason}).`,
    noQuery:
      'Gib einen Namen ein oder trage die Position deines Zuhauses in Gladys ein (Einstellungen → Zuhause), um die nächstgelegenen aufzulisten.',
    noMatch: ({ query }) => `Nichts passt zu „${query}“.`,
    foundStops: ({ count }) => `${count} Haltestelle(n) gefunden:`,
    closestStops: ({ house }) => `Nächstgelegene Haltestellen zu ${house}:`,
    foundStations: ({ count }) => `${count} Station(en) gefunden:`,
    closestStations: ({ house }) => `Nächstgelegene Stationen zu ${house}:`,
    addStopHint:
      'Um eine zu überwachen, starte „Haltestelle hinzufügen“ mit ihrem Namen oder ihrer Kennung (SA_…).',
    addStationHint:
      'Um eine zu überwachen, starte „Radstation hinzufügen“ mit ihrem Namen oder ihrer Nummer.',
    ambiguous: ({ query }) => `Mehrere Treffer für „${query}“: Füge sie über ihre Kennung hinzu.`,
    stopAdded: ({ name, lines }) => `${name} hinzugefügt (${lines}).`,
    stopUpdated: ({ name, lines }) => `${name} aktualisiert (${lines}).`,
    allLines: 'alle Linien',
    unknownLines: ({ lines, available }) =>
      `Diese Linie(n) halten hier nicht: ${lines}. Linien an dieser Haltestelle: ${available}.`,
    stationAdded: ({ name }) => `${name} hinzugefügt.`,
    stationKnown: ({ name }) => `${name} wird bereits überwacht.`,
    toDiscovery: 'Öffne den Tab „Entdecken“, um ihr Gerät anzulegen.',
    removed: ({ name }) =>
      `${name} aus der Liste entfernt. Lösche das Gerät in Gladys, falls nötig.`,
    notWatched: ({ query }) => `Nichts Überwachtes heißt „${query}“ oder hat diese Kennung.`,
    tooMany: ({ max }) => `Die Liste ist voll (höchstens ${max}).`,
    watchedStops: ({ count }) => `Überwachte Haltestellen: ${count}`,
    watchedStations: ({ count }) => `Überwachte Radstationen: ${count}`,
    timetable: ({ date, until }) =>
      `Fahrplan: am ${date} heruntergeladen, Abfahrten bis ${until} bekannt.`,
    timetableMissing: 'Fahrplan: noch nicht heruntergeladen.',
    realtime: ({ age, tracked }) =>
      `Echtzeit: vor ${age} s aktualisiert, ${tracked} Fahrzeug(e) im Netz verfolgt.`,
    realtimeOff: 'Echtzeit: in der Konfiguration ausgeschaltet (nur Fahrplan).',
    realtimeWaiting: 'Echtzeit: noch nicht gelesen.',
    bikes: ({ age }) => `VélôToulouse: vor ${age} s aktualisiert.`,
    bikesWaiting: 'VélôToulouse: noch nicht gelesen.',
    lastError: ({ error }) => `Letzter Fehler: ${error}`,
  },
  es: {
    loading:
      'Los horarios de Tisséo aún se están cargando (15 MB en el primer arranque, un minuto aproximadamente). Vuelva a intentarlo en un momento.',
    gtfsFailed: ({ reason }) =>
      `No se han podido descargar los horarios de Tisséo (${reason}). Vuelva a intentarlo más tarde.`,
    gbfsFailed: ({ reason }) => `No se han podido leer las estaciones VélôToulouse (${reason}).`,
    noQuery:
      'Escriba un nombre, o indique la posición de su casa en Gladys (Configuración → Viviendas) para listar las más cercanas.',
    noMatch: ({ query }) => `Nada coincide con «${query}».`,
    foundStops: ({ count }) => `${count} parada(s) encontrada(s):`,
    closestStops: ({ house }) => `Paradas más cercanas a ${house}:`,
    foundStations: ({ count }) => `${count} estación(es) encontrada(s):`,
    closestStations: ({ house }) => `Estaciones más cercanas a ${house}:`,
    addStopHint:
      'Para vigilar una, ejecute «Añadir una parada» con su nombre o su identificador (SA_…).',
    addStationHint:
      'Para vigilar una, ejecute «Añadir una estación de bicis» con su nombre o su número.',
    ambiguous: ({ query }) => `Varios resultados para «${query}»: añádala por su identificador.`,
    stopAdded: ({ name, lines }) => `${name} añadida (${lines}).`,
    stopUpdated: ({ name, lines }) => `${name} actualizada (${lines}).`,
    allLines: 'todas las líneas',
    unknownLines: ({ lines, available }) =>
      `Línea(s) que no pasan por esta parada: ${lines}. Líneas de esta parada: ${available}.`,
    stationAdded: ({ name }) => `${name} añadida.`,
    stationKnown: ({ name }) => `${name} ya está vigilada.`,
    toDiscovery: 'Abra la pestaña Descubrir para crear su dispositivo.',
    removed: ({ name }) =>
      `${name} eliminada de la lista. Elimine su dispositivo en Gladys si lo necesita.`,
    notWatched: ({ query }) =>
      `Nada de lo vigilado se llama «${query}» ni tiene este identificador.`,
    tooMany: ({ max }) => `La lista está llena (${max} como máximo).`,
    watchedStops: ({ count }) => `Paradas vigiladas: ${count}`,
    watchedStations: ({ count }) => `Estaciones de bicis vigiladas: ${count}`,
    timetable: ({ date, until }) =>
      `Horarios: descargados el ${date}, salidas conocidas hasta el ${until}.`,
    timetableMissing: 'Horarios: aún no descargados.',
    realtime: ({ age, tracked }) =>
      `Tiempo real: actualizado hace ${age} s, ${tracked} vehículo(s) seguido(s) en la red.`,
    realtimeOff: 'Tiempo real: desactivado en la configuración (solo horarios teóricos).',
    realtimeWaiting: 'Tiempo real: aún sin leer.',
    bikes: ({ age }) => `VélôToulouse: actualizado hace ${age} s.`,
    bikesWaiting: 'VélôToulouse: aún sin leer.',
    lastError: ({ error }) => `Último error: ${error}`,
  },
};

/** One entry of a table, in one language (function entries rendered). */
export function say(table, language, key, params = {}) {
  const entries = table[language] ?? table.en;
  const entry = entries[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** One entry of a table, in every language. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((language) => [language, say(table, language, key, params)]),
  );
}

/** Joins rendered messages (or plain strings), language by language, one per line. */
export function lines(...messages) {
  const languages = Object.keys(messages.find((m) => typeof m === 'object') ?? { en: '' });
  return Object.fromEntries(
    languages.map((language) => [
      language,
      messages
        .filter((message) => message !== null && message !== undefined)
        .map((message) => (typeof message === 'string' ? message : message[language]))
        .join('\n'),
    ]),
  );
}
