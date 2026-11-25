/* Kifékoi — tutoriel de premier lancement et rubrique d'aide */

export const TUTORIAL = [
  {
    emoji: '👋',
    title: 'Bienvenue sur Kifékoi',
    text: "L'agenda partagé de votre famille : rendez-vous, vaccins, école, garde alternée… et les informations de chacun au même endroit.",
  },
  {
    emoji: '👨‍👩‍👧',
    title: '1. Les personnes',
    text: "Commencez par l'onglet <b>Personnes</b> : ajoutez les parents (type « Parent »), les enfants (type « Enfant ») et même les animaux. Les anniversaires se créent tout seuls à partir de la date de naissance.",
  },
  {
    emoji: '🗓️',
    title: "2. L'agenda",
    text: "Touchez le bouton <b>+</b> à côté des personnes pour ajouter un rendez-vous, un vaccin ou des vacances. Choisissez un rappel : le téléphone vous prévient de l'heure même à une semaine avant.",
  },
  {
    emoji: '🔁',
    title: '3. Garde alternée (facultatif)',
    text: "Cette étape est <b>facultative</b> : elle concerne les <b>parents séparés</b>. Dans <b>Réglages → Garde alternée</b>, choisissez le rythme (1 semaine / 1 semaine, 2 semaines / 2 semaines, ou un nombre de jours) et la date de départ. Pour un jour particulier : <b>Agenda → le jour → Modifier</b>.",
  },
  {
    emoji: '🤝',
    title: '4. Entre parents',
    text: "Si vous activez les <b>demandes de validation</b>, chaque changement de garde ou nouvel événement d'un enfant doit être accepté par l'autre parent (avec un commentaire possible).",
  },
  {
    emoji: '🔗',
    title: '5. Deux téléphones',
    text: "Créez un compte dans <b>Réglages</b> puis connectez-vous avec <b>le même compte</b> sur l'autre téléphone : les données se partagent. Activez aussi les notifications push pour être prévenu même application fermée.",
  },
  {
    emoji: '✅',
    title: 'Tout est prêt',
    text: "Vous retrouverez ce guide à tout moment dans <b>Réglages → Aide</b>. Bonne organisation !",
  },
];

export const HELP_SECTIONS = [
  {
    emoji: '🚀',
    title: 'Démarrer en 3 minutes',
    html: `<ul class="help-list">
      <li>Ajoutez les personnes dans l'onglet <b>Personnes</b> (bouton <b>+</b>).</li>
      <li>Créez un premier rendez-vous avec le bouton <b>+</b> à droite des personnes, sur l'Agenda.</li>
      <li>Choisissez un <b>rappel</b> (de l'heure même à une semaine avant) pour être prévenu.</li>
      <li>Si vous partagez la garde, réglez <b>Réglages → Garde alternée</b>.</li>
      <li>Pour partager entre deux téléphones : <b>Réglages → Relier ce téléphone</b>.</li>
    </ul>`,
  },
  {
    emoji: '👨‍👩‍👧',
    title: 'Personnes, contacts et notes',
    html: `<ul class="help-list">
      <li><b>Type</b> : Parent, Enfant ou Animal. Le type sert aux couleurs, aux anniversaires et à la garde alternée.</li>
      <li>La <b>date de naissance</b> crée automatiquement un anniversaire chaque année dans l'agenda.</li>
      <li><b>Contacts utiles</b> : pédiatre, école, nourrice… avec numéro et e-mail cliquables depuis la fiche.</li>
      <li><b>Infos à retenir</b> : allergies, traitement, taille de chaussures, habitudes…</li>
      <li>Le bouton <b>Modifier</b> (crayon) permet de changer nom, emoji, couleur et rôle.</li>
    </ul>`,
  },
  {
    emoji: '🗓️',
    title: 'Rendez-vous, rappels et répétitions',
    html: `<ul class="help-list">
      <li>Un événement peut concerner <b>plusieurs personnes</b> à la fois (pastilles colorées).</li>
      <li><b>Journée entière</b> pour les vacances ou les dates sans heure précise.</li>
      <li><b>Répétition</b> : tous les jours, semaines, mois ou années, avec une fin (date) ou un nombre de fois.</li>
      <li>Un événement peut être marqué <b>fait</b> (case à cocher) ou <b>supprimé</b> depuis sa fiche.</li>
      <li>Les <b>vacances scolaires</b> (selon la zone choisie dans les réglages) apparaissent automatiquement en orange.</li>
    </ul>`,
  },
  {
    emoji: '🔁',
    title: 'Garde alternée et exceptions',
    html: `<ul class="help-list">
      <li><b>Facultatif</b> : cette partie sert uniquement si les <b>parents sont séparés</b> et se partagent la garde des enfants.</li>
      <li>Réglages → <b>Garde alternée</b> : choisissez l'enfant, activez, puis désignez les deux parents.</li>
      <li><b>Rythme</b> : 1 semaine / 1 semaine, 2 semaines / 2 semaines, 3 j / 4 j… ou un nombre de jours libre (7 = 1 semaine), avec une <b>date de départ</b> : le changement peut donc tomber un mercredi, un vendredi, etc.</li>
      <li>Chaque enfant a ses propres règles. « Appliquer à tous les enfants » copie la règle en cours.</li>
      <li>Les barres au-dessus du calendrier indiquent chez qui se passe <b>le matin</b> et <b>l'après-midi</b> ; la lettre indique où l'enfant <b>dort</b>.</li>
      <li>Pour un jour précis : <b>Agenda → le jour → Modifier</b> → Matin / Après-midi / Nuit.</li>
      <li>Un événement de type <b>Vacances</b> peut être marqué « impacte la garde » pour suspendre l'alternance.</li>
    </ul>`,
  },
  {
    emoji: '🤝',
    title: 'Demandes entre parents',
    html: `<ul class="help-list">
      <li>Dans <b>Réglages → Validation entre parents</b>, donnez un nom à chaque téléphone (Papa / Maman) et activez.</li>
      <li>Quand un parent modifie la garde ou crée un événement pour un enfant, une <b>demande</b> apparaît sur l'Agenda de l'autre.</li>
      <li>L'autre parent peut <b>accepter</b> ou <b>refuser</b> avec un commentaire. Un refus annule la modification.</li>
      <li>L'auteur est prévenu de la réponse (notification + historique dans « Demandes »).</li>
      <li>Les deux téléphones doivent avoir des noms <b>différents</b>.</li>
    </ul>`,
  },
  {
    emoji: '🔗',
    title: 'Partager entre deux téléphones',
    html: `<ul class="help-list">
      <li>Téléphone 1 : <b>Réglages → Créer le compte</b> (e-mail + mot de passe).</li>
      <li>Téléphone 2 : <b>Réglages → Relier ce téléphone</b> avec <b>le même e-mail et mot de passe</b>.</li>
      <li>La synchronisation se fait automatiquement (à l'ouverture, toutes les 45 s et après chaque modification).</li>
      <li>Le point coloré près de l'onglet Réglages indique l'état : vert = à jour, orange = en cours, rouge = erreur.</li>
      <li>Un compte = une famille. Pour une autre famille, créez un autre compte.</li>
    </ul>`,
  },
  {
    emoji: '🔔',
    title: 'Notifications (app ouverte / fermée)',
    html: `<ul class="help-list">
      <li><b>Rappels d'événements</b> : Réglages → Notifications → <b>Activer</b>. Sur Android, elles arrivent quand l'app est ouverte ou récemment utilisée.</li>
      <li><b>Demandes de l'autre parent, même app fermée</b> : Réglages → <b>Notifications même app fermée</b> → Activer sur <b>chaque</b> téléphone.</li>
      <li>Si rien n'arrive : vérifiez les autorisations du navigateur (Chrome → Infos du site → Notifications) et que les deux téléphones sont connectés au même compte.</li>
      <li>Pour des rappels garantis sans ouvrir l'app, exportez le calendrier (.ics) vers Google Agenda (Réglages → Calendrier).</li>
    </ul>`,
  },
  {
    emoji: '💾',
    title: 'Sauvegarde, restauration et doublons',
    html: `<ul class="help-list">
      <li><b>Sauvegarder</b> télécharge un fichier de vos données : conservez-le ou envoyez-le sur l'autre téléphone.</li>
      <li><b>Restaurer</b> réimporte un fichier de sauvegarde (les doublons sont évités).</li>
      <li><b>Nettoyer les doublons de personnes</b> fusionne les fiches portant le même nom et réaffecte leurs événements.</li>
      <li>Les données restent sur le téléphone : sans compte, elles ne sont pas partagées.</li>
    </ul>`,
  },
  {
    emoji: '📊',
    title: 'Bilan et dépenses partagées',
    html: `<ul class="help-list">
      <li>Onglet <b>Bilan</b> : nombre de jours de garde par parent pour chaque enfant, sur une période au choix (<b>depuis la rentrée</b>, un <b>mois</b> ou une <b>année</b>).</li>
      <li><b>Dépenses</b> : bouton « ＋ Ajouter une dépense » — libellé, montant, date, qui a payé, catégorie.</li>
      <li>Le partage est de <b>50/50</b> par défaut ; il peut être modifié (60/40, 100 % pour un parent) au cas par cas.</li>
      <li>Le <b>solde</b> s'affiche automatiquement : « Papa doit 42,50 € à Maman ».</li>
      <li>Le bouton <b>Remboursé</b> enregistre le remboursement et remet le solde à zéro.</li>
    </ul>`,
  },
  {
    emoji: '❓',
    title: 'Questions fréquentes',
    html: `<ul class="help-list">
      <li><b>J'ai changé de navigateur / d'adresse et tout a disparu.</b> Les données sont liées au navigateur et à l'adresse du site. Utilisez la sauvegarde ou connectez le même compte.</li>
      <li><b>Les deux téléphones ne se voient pas.</b> Vérifiez que le même compte est utilisé et que l'état de synchro est vert.</li>
      <li><b>Une demande reste « En attente ».</b> Elle attend la réponse de l'autre parent ; vous pouvez la refuser/accepter depuis « Demandes ».</li>
      <li><b>Comment supprimer un événement ?</b> Ouvrez-le puis « Supprimer » (une demande est créée si la validation est active).</li>
      <li><b>Puis-je utiliser Kifékoi sans compte ?</b> Oui, en local, mais les données ne seront pas partagées.</li>
    </ul>`,
  },
];
