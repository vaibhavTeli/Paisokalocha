/**
 * Main Entry Point for the PersonalManager Application.
 *
 * @format
 */

import 'react-native-gesture-handler';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList,
  Dimensions
} from 'react-native';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createTables, insertTransaction, getTransactions } from './database';
import { requestSmsPermission, startSmsListener } from './SmsService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_HEIGHT = 200;
const Y_MIN = 10;
const Y_MAX = 10000;

// Define consistent colors for accounts
const ACCOUNT_COLORS = {
  Axis: '#800000',
  ESAF: '#004A99',
  ICICI: '#F37021',
  IDBI: '#009639',
  Rupay: '#0055A4',
  Default: '#666',
};

/**
 * Helper to capitalize the first letter of each word for consistent display
 */
const formatDescription = (str) => {
  if (!str) return 'No Description';
  return str.trim().toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

/**
 * Draws a line segment between two points using a standard View.
 */
const LineSegment = ({ p1, p2, color }) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <View
      style={{
        position: 'absolute',
        left: (p1.x + p2.x) / 2 - distance / 2,
        top: (p1.y + p2.y) / 2 - 1,
        width: distance,
        height: 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
};

/**
 * A custom Line Chart component.
 */
const SpendingLineChart = ({ transactions }) => {
  const scrollViewRef = useRef(null);
  const { chartLines, daysInMonth, descriptions, currentDay } = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const days = new Date(year, month + 1, 0).getDate();

    const groupedData = {}; // { desc: { day: totalAmount } }
    const descs = new Set();

    transactions.forEach(t => {
      const d = new Date(t.date);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        const desc = formatDescription(t.description);
        descs.add(desc);
        if (!groupedData[desc]) groupedData[desc] = {};
        groupedData[desc][day] = (groupedData[desc][day] || 0) + t.amount;
      }
    });

    const lines = Array.from(descs).map(desc => {
      const points = [];
      for (let day = 1; day <= days; day++) {
        const amount = groupedData[desc][day] || 0;
        // Map amount to Y coordinate (inverted for screen)
        const clampedAmount = Math.max(Y_MIN, Math.min(Y_MAX, amount));
        const y = CHART_HEIGHT - ((clampedAmount - Y_MIN) / (Y_MAX - Y_MIN)) * CHART_HEIGHT;
        points.push({ x: (day - 1) * 50 + 40, y, amount });
      }
      return { desc, points };
    });

    return {
      chartLines: lines,
      daysInMonth: days,
      descriptions: Array.from(descs),
      currentDay: now.getDate()
    };
  }, [transactions]);

  // Auto-scroll to current day or latest transaction
  useEffect(() => {
    if (scrollViewRef.current) {
      const scrollX = Math.max(0, (currentDay - 3) * 50);
      scrollViewRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [currentDay, chartLines]);

  const colors = ['#007AFF', '#28a745', '#dc3545', '#ffc107', '#17a2b8', '#6610f2', '#e83e8c'];
  const descColors = useMemo(() => {
    const map = {};
    descriptions.forEach((d, i) => { map[d] = colors[i % colors.length]; });
    return map;
  }, [descriptions]);

  return (
    <View style={styles.chartWrapper}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>Spending Trends (₹10 - ₹10k)</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View style={{ height: CHART_HEIGHT + 40, width: daysInMonth * 50 + 60 }}>
          {/* Y-Axis Grid Lines */}
          {[10, 1000, 5000, 10000].map(val => {
            const y = CHART_HEIGHT - ((val - Y_MIN) / (Y_MAX - Y_MIN)) * CHART_HEIGHT;
            return (
              <View key={val} style={[styles.gridLine, { top: y }]}>
                <Text style={styles.gridLabel}>₹{val >= 1000 ? val/1000 + 'k' : val}</Text>
              </View>
            );
          })}

          {/* Line Plots */}
          {chartLines.map((line) => (
            <View key={line.desc} style={StyleSheet.absoluteFill}>
              {line.points.map((p, i) => {
                if (i === 0) return null;
                const prev = line.points[i - 1];
                if (p.amount === 0 && prev.amount === 0) return null;
                return (
                  <LineSegment
                    key={`${line.desc}-${i}`}
                    p1={prev}
                    p2={p}
                    color={descColors[line.desc]}
                  />
                );
              })}
              {/* Data points */}
              {line.points.map((p, i) => p.amount > 0 && (
                <View
                  key={`dot-${i}`}
                  style={[styles.dot, { left: p.x - 4, top: p.y - 4, backgroundColor: descColors[line.desc] }]}
                />
              ))}
            </View>
          ))}

          {/* X-Axis Labels */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
            <Text key={day} style={[styles.dayLabelLine, { left: (day - 1) * 50 + 35 }]}>{day}</Text>
          ))}
        </View>
      </ScrollView>

      <View style={styles.legendContainer}>
        {descriptions.slice(0, 8).map(desc => (
          <View key={desc} style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: descColors[desc] }]} />
            <Text style={styles.legendText} numberOfLines={1}>{desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/**
 * Screen for displaying financial spendings and statistics.
 */
const FinancialSpendings = () => {
  const [transactions, setTransactions] = useState([]);
  const isFocused = useIsFocused();

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = await getTransactions();
        setTransactions(data);
      } catch (error) {
        console.error("Fetch Transactions Error:", error);
      }
    };
    if (isFocused) {
      fetchTransactions();
    }
  }, [isFocused]);

  const mergedTransactions = useMemo(() => {
    const groups = {};
    transactions.forEach(t => {
      const formattedDesc = formatDescription(t.description);
      const key = `${formattedDesc.toLowerCase()}-${t.account_no}`;

      if (!groups[key]) {
        groups[key] = { ...t, description: formattedDesc };
      } else {
        groups[key].amount += t.amount;
        if (new Date(t.date) > new Date(groups[key].date)) {
          groups[key].date = t.date;
        }
      }
    });
    return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const renderItem = ({ item }) => {
    const accountColor = ACCOUNT_COLORS[item.account_no] || ACCOUNT_COLORS.Default;

    return (
      <View style={[styles.transactionItem, { borderLeftWidth: 5, borderLeftColor: accountColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.transactionDescription}>{item.description}</Text>
          <View style={styles.accountBadgeContainer}>
            <View style={[styles.accountBadge, { backgroundColor: accountColor }]}>
              <Text style={styles.accountBadgeText}>{item.account_no}</Text>
            </View>
            <Text style={styles.transactionDate}>{new Date(item.date).toLocaleDateString()}</Text>
          </View>
        </View>
        <Text style={[styles.transactionAmount, { color: accountColor }]}>₹{item.amount.toFixed(2)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.screenContainerFull}>
      <SpendingLineChart transactions={transactions} />
      <Text style={styles.listHeader}>Transactions</Text>
      <FlatList
        data={mergedTransactions}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>No transactions found.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
};

/**
 * Screen for manual entry of financial transactions.
 */
const AddFinancialPoint = ({ navigation }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [account, setAccount] = useState('Axis');

  const accounts = ['Axis', 'ESAF', 'ICICI', 'IDBI', 'Rupay'];

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      Alert.alert("Invalid Input", "Please enter a valid amount.");
      return;
    }

    try {
      const date = new Date().toISOString();
      await insertTransaction('Manual Entry', parseFloat(amount), account, description, date);
      navigation.navigate('Financial Spendings');
      setAmount('');
      setDescription('');
    } catch (error) {
      console.error("Save Error:", error);
      Alert.alert("Error", "Failed to save transaction.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.formContainer}>
      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 500.00"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Select Account</Text>
      <View style={styles.accountSelector}>
        {accounts.map((acc) => (
          <TouchableOpacity
            key={acc}
            style={[
              styles.accountButton,
              account === acc && { backgroundColor: ACCOUNT_COLORS[acc], borderColor: ACCOUNT_COLORS[acc] }
            ]}
            onPress={() => setAccount(acc)}
          >
            <Text style={[
              styles.accountButtonText,
              { color: account === acc ? '#fff' : (ACCOUNT_COLORS[acc] || ACCOUNT_COLORS.Default) }
            ]}>
              {acc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        placeholder="What did you buy?"
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save Transaction</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const AddTask = () => (
  <View style={styles.screenContainer}>
    <Text style={styles.screenTitle}>✅ Add a Task</Text>
  </View>
);

const Drawer = createDrawerNavigator();

export default function App() {
  useEffect(() => {
    const setupApp = async () => {
      try {
        await createTables();
        const hasPermission = await requestSmsPermission();
        if (hasPermission) {
          startSmsListener();
        } else {
          Alert.alert("Permission Required", "Please grant SMS permissions to enable automatic transaction tracking.");
        }
      } catch (error) {
        console.error('Failed to initialize application:', error);
        Alert.alert("Error", "Failed to initialize database.");
      }
    };
    setupApp();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Drawer.Navigator initialRouteName="Financial Spendings">
            <Drawer.Screen
              name="Financial Spendings"
              component={FinancialSpendings}
              options={{ title: 'Dashboard' }}
            />
            <Drawer.Screen
              name="Add Financial Point"
              component={AddFinancialPoint}
              options={{ title: 'Add Transaction' }}
            />
            <Drawer.Screen
              name="AddTask"
              component={AddTask}
              options={{ title: 'Tasks' }}
            />
          </Drawer.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  chartWrapper: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  gridLine: {
    position: 'absolute',
    left: 40,
    right: 0,
    height: 1,
    backgroundColor: '#f0f0f0',
    zIndex: -1,
  },
  gridLabel: {
    position: 'absolute',
    left: -35,
    top: -8,
    fontSize: 9,
    color: '#aaa',
    width: 30,
    textAlign: 'right',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 2,
  },
  dayLabelLine: {
    position: 'absolute',
    bottom: 5,
    fontSize: 10,
    color: '#bbb',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 4,
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#666',
    maxWidth: 70,
  },
  screenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenContainerFull: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  listHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 20,
    paddingTop: 5,
    paddingBottom: 10,
    color: '#333',
  },
  transactionItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  accountBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  accountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  accountBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: '#999',
    fontSize: 16,
  },
  formContainer: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  accountSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  accountButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
  },
  accountButtonText: {
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
