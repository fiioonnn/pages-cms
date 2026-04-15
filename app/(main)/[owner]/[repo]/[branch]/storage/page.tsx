"use client";

import { StorageSettings } from "@/components/storage/storage-settings";
import { DocumentTitle, formatRepoBranchTitle } from "@/components/document-title";
import { useConfig } from "@/contexts/config-context";

export default function Page() {
  const { config } = useConfig();

  return (
    <>
      {config && (
        <DocumentTitle
          title={formatRepoBranchTitle(
            "Storage",
            config.owner,
            config.repo,
            config.branch,
          )}
        />
      )}
      <StorageSettings />
    </>
  );
}
