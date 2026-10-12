/* Community decks: the browse list at /community and one public deck at /community/decks/:id.
   Playing borrows the deck for the lobby without saving it; copying saves an editable copy. */

import { useCallback, useState } from "react";
import type { CommunityDeck } from "@aegis/shared";
import { communityApi } from "../../community/client";
import { SuccessToast } from "../../design/SuccessToast";
import { useTranslation } from "../../i18n";
import { CommunityBrowse } from "./CommunityBrowse";
import { CommunityDeckPage } from "./CommunityDeckPage";
import "./community.css";

export function CommunityScreen({
  deckId,
  signedIn,
  accountId,
  isAdmin,
  onOpenDeck,
  onBack,
  onPlay,
  onCopy,
  onDiscussions,
  onRoadmap,
}: {
  deckId: string | undefined;
  signedIn: boolean;
  accountId: string | undefined;
  isAdmin: boolean;
  onOpenDeck: (id: string) => void;
  onBack: () => void;
  onPlay: (deck: CommunityDeck) => void;
  onCopy: (deck: CommunityDeck) => void;
  onDiscussions?: () => void;
  onRoadmap?: () => void;
}) {
  const { t } = useTranslation();
  const [toast, setToast] = useState<string>();
  const dismissToast = useCallback(() => setToast(undefined), []);

  const copy = (deck: CommunityDeck) => {
    onCopy(deck);
    setToast(t("community.copied", { name: deck.name }));
  };
  // Browse tiles carry no card list, so their actions fetch the full deck first. A deck that was
  // unpublished meanwhile fails here; its own page then says so.
  const withDeck = (action: (deck: CommunityDeck) => void) => (id: string) => {
    communityApi
      .deck(id)
      .then(action)
      .catch(() => onOpenDeck(id));
  };

  return (
    <>
      {deckId ? (
        <CommunityDeckPage
          deckId={deckId}
          signedIn={signedIn}
          accountId={accountId}
          isAdmin={isAdmin}
          onBack={onBack}
          onPlay={onPlay}
          onCopy={copy}
          onNotice={setToast}
        />
      ) : (
        <CommunityBrowse
          onDiscussions={onDiscussions}
          onRoadmap={onRoadmap}
          signedIn={signedIn}
          accountId={accountId}
          onOpenDeck={onOpenDeck}
          onPlay={withDeck(onPlay)}
          onCopy={withDeck(copy)}
        />
      )}
      {toast ? <SuccessToast message={toast} onDismiss={dismissToast} /> : null}
    </>
  );
}
