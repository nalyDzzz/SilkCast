import type { SourceRecord } from '@/components/app/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type DeleteSourceDialogProps = {
  source: SourceRecord | null;
  onCancel: () => void;
  onConfirm: (source: SourceRecord) => void;
};

export function DeleteSourceDialog({
  source,
  onCancel,
  onConfirm,
}: DeleteSourceDialogProps) {
  return (
    <AlertDialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{source?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the source, its imported catalog, favorites, and watch
            history from this computer. Your provider account is not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (source) {
                onConfirm(source);
              }
            }}
          >
            Delete source
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
