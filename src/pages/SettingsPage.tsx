import { useShallow } from 'zustand/react/shallow';
import { PlaybackSettingsCard } from '@/components/settings/PlaybackSettingsCard';
import { UpdatesSettingsCard } from '@/components/settings/UpdatesSettingsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type AppTheme, useAppStore } from '@/store/appStore';
import { PageHeader } from '@/components/layouts/PageHeader';

export function SettingsPage() {
  const { theme, setTheme } = useAppStore(
    useShallow((state) => ({
      theme: state.theme,
      setTheme: state.setTheme,
    }))
  );

  return (
    <main className="p-4 md:p-6">
      <section className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          title="Settings"
          description="Choose your default player, what happens at startup, and the theme."
        />

        <PlaybackSettingsCard />

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <Select
                value={theme}
                onValueChange={(value) => setTheme(value as AppTheme)}
              >
                <SelectTrigger aria-label="Theme">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <p className="text-sm text-muted-foreground">
              Theme changes apply immediately and are saved on this device.
            </p>
          </CardContent>
        </Card>

        <UpdatesSettingsCard />
      </section>
    </main>
  );
}
