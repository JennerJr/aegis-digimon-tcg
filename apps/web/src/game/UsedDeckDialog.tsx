import { useState } from "react";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { FamousDeckListDialog } from "@/screens/FamousDeckListDialog";
import { usedDeckListing } from "@/game/usedDeckListing";
import type { DeckListing } from "@/game/decks";
import { useTranslation } from "@/i18n/useTranslation";

export function UsedDeckDialog({
  snapshot,
  onCopy,
  onClose,
}: {
  snapshot: UsedDeck;
  onCopy: (deck: DeckListing) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <FamousDeckListDialog
      deck={usedDeckListing({ snapshot })}
      collection={snapshot.community?.author.displayName ?? ""}
      eyebrow={t("overlay.usedDeck")}
      active={false}
      copied={copied}
      onCopy={() => {
        onCopy(usedDeckListing({ snapshot }));
        setCopied(true);
      }}
      onClose={onClose}
    />
  );
}
