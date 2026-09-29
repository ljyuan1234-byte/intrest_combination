import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { Dashboard } from '@life/contracts';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/dashboard`)
      .then(async (response) => {
        if (!response.ok) throw new Error('API request failed');
        return response.json();
      })
      .then(setDashboard)
      .catch(() => setError('暂时无法连接助手服务，请确认 API 已启动。'));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>PERSONAL OPERATING SYSTEM</Text>
        <Text style={styles.title}>把今天过得更清楚。</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!dashboard && !error ? <ActivityIndicator color="#17242b" /> : null}
        {dashboard ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>今日健康建议</Text>
            <Text style={styles.cardText}>{dashboard.health.suggestion}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f5' },
  container: { flex: 1, padding: 28, paddingTop: 64 },
  eyebrow: { color: '#718087', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#17242b', fontSize: 42, fontWeight: '800', lineHeight: 45, marginTop: 14 },
  card: { backgroundColor: '#fff', borderColor: '#dfe8e2', borderRadius: 20, borderWidth: 1, marginTop: 40, padding: 22 },
  cardLabel: { color: '#718087', fontSize: 13 },
  cardText: { color: '#40545b', fontSize: 18, lineHeight: 28, marginTop: 16 },
  error: { color: '#a34f45', fontSize: 16, lineHeight: 24, marginTop: 32 },
});
