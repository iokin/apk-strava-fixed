import React, { useState, useEffect, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { App as CapacitorApp } from '@capacitor/app';

const StravaMinAPK = () => {
  const [currentView, setCurrentView] = useState('home');
  const [activities, setActivities] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [currentActivity, setCurrentActivity] = useState(null);
  const [activityType, setActivityType] = useState('running');
  const watchIdRef = useRef(null);
  const [stats, setStats] = useState({
    totalKm: 0,
    totalActivities: 0,
    avgPace: 0,
    totalCalories: 0
  });

  // Cargar actividades al iniciar
  useEffect(() => {
    loadActivities();
    setupBackButton();
  }, []);

  // Calcular estadísticas
  useEffect(() => {
    calculateStats();
  }, [activities]);

  const setupBackButton = async () => {
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        CapacitorApp.exitApp();
      }
    });
  };

  const loadActivities = () => {
    const saved = localStorage.getItem('strava_activities');
    if (saved) {
      setActivities(JSON.parse(saved));
    }
  };

  const saveActivities = (newActivities) => {
    setActivities(newActivities);
    localStorage.setItem('strava_activities', JSON.stringify(newActivities));
  };

  const calculateStats = () => {
    if (activities.length === 0) {
      setStats({ totalKm: 0, totalActivities: 0, avgPace: 0, totalCalories: 0 });
      return;
    }

    const totalKm = activities.reduce((sum, a) => sum + a.distance, 0);
    const totalCalories = activities.reduce((sum, a) => sum + a.calories, 0);
    const avgPace = activities.length > 0 
      ? activities.reduce((sum, a) => sum + a.avgPace, 0) / activities.length 
      : 0;

    setStats({
      totalKm: totalKm.toFixed(2),
      totalActivities: activities.length,
      avgPace: avgPace.toFixed(2),
      totalCalories: totalCalories.toFixed(0)
    });
  };

  const startTracking = () => {
    setIsTracking(true);
    setCurrentActivity({
      type: activityType,
      startTime: new Date(),
      distance: 0,
      coordinates: [],
      maxSpeed: 0,
      avgSpeed: 0,
      calories: 0,
      duration: 0
    });

    // Usar Geolocation de Capacitor (funciona con pantalla apagada)
    watchIdRef.current = Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      },
      (position, error) => {
        if (error) {
          console.error('GPS Error:', error);
          return;
        }

        if (position) {
          const { latitude, longitude } = position.coords;
          const speed = position.coords.speed || 0;

          setCurrentActivity(prev => {
            if (!prev) return prev;

            const newCoords = [...prev.coordinates, { latitude, longitude, speed, timestamp: Date.now() }];
            let distance = prev.distance;

            if (newCoords.length > 1) {
              const lastCoord = newCoords[newCoords.length - 2];
              distance += calculateDistance(
                lastCoord.latitude,
                lastCoord.longitude,
                latitude,
                longitude
              );
            }

            const maxSpeed = Math.max(prev.maxSpeed, speed);
            const avgSpeed = speed * 3.6; // m/s a km/h

            // Calcular calorías
            const isRunning = prev.type === 'running';
            const caloriesBurned = (distance / 1000) * (isRunning ? 60 : 30);

            return {
              ...prev,
              coordinates: newCoords,
              distance,
              maxSpeed,
              avgSpeed,
              calories: caloriesBurned,
              duration: Math.floor((new Date() - prev.startTime) / 1000)
            };
          });
        }
      }
    );

    // Actualizar display cada segundo
    const interval = setInterval(() => {
      setCurrentActivity(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          duration: Math.floor((new Date() - prev.startTime) / 1000)
        };
      });
    }, 1000);

    // Guardar el intervalo para limpiarlo después
    currentActivity.intervalId = interval;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // metros
  };

  const stopTracking = async () => {
    if (watchIdRef.current) {
      await Geolocation.clearWatch({ id: watchIdRef.current });
    }

    if (currentActivity.intervalId) {
      clearInterval(currentActivity.intervalId);
    }

    setIsTracking(false);

    if (currentActivity && currentActivity.distance > 10) { // Mínimo 10 metros
      const newActivity = {
        id: Date.now(),
        ...currentActivity,
        distance: currentActivity.distance / 1000, // km
        endTime: new Date(),
        avgPace: currentActivity.duration > 0 
          ? (currentActivity.distance / 1000) / (currentActivity.duration / 3600)
          : 0,
        coordinates: currentActivity.coordinates.map(c => ({
          lat: c.latitude,
          lng: c.longitude
        }))
      };

      delete newActivity.intervalId;

      const newActivities = [...activities, newActivity];
      saveActivities(newActivities);
    }

    setCurrentActivity(null);
  };

  const deleteActivity = (id) => {
    const newActivities = activities.filter(a => a.id !== id);
    saveActivities(newActivities);
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Vista Home
  const HomeView = () => (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-3xl">📊</span>
          <h1 className="text-3xl font-bold">StravaMin</h1>
        </div>
        <p className="text-orange-100">Tu app personal de carreras y caminatas</p>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">⚡</span>
            <span className="text-sm text-gray-600">Total KM</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalKm}</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🏃</span>
            <span className="text-sm text-gray-600">Actividades</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalActivities}</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">📈</span>
            <span className="text-sm text-gray-600">Ritmo Promedio</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.avgPace} km/h</p>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-md">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🔥</span>
            <span className="text-sm text-gray-600">Calorías</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.totalCalories}</p>
        </div>
      </div>

      {/* Botón Nueva Actividad */}
      <div className="p-4">
        <button
          onClick={() => setCurrentView('record')}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition"
        >
          ➕ Nueva Actividad
        </button>
      </div>

      {/* Últimas Actividades */}
      <div className="p-4">
        <h2 className="text-xl font-bold text-gray-800 mb-3 flex items-center gap-2">
          📱 Últimas Actividades
        </h2>
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="bg-white p-6 rounded-lg text-center text-gray-500">
              <p>Aún no tienes actividades</p>
              <p className="text-sm">¡Comienza a registrar tu primera carrera!</p>
            </div>
          ) : (
            activities.slice(-5).reverse().map(activity => (
              <div key={activity.id} className="bg-white p-4 rounded-lg shadow-md">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-800">
                      {activity.type === 'running' ? '🏃 Carrera' : '🚶 Caminata'}
                    </p>
                    <p className="text-sm text-gray-500">{formatDate(activity.startTime)}</p>
                  </div>
                  <button
                    onClick={() => deleteActivity(activity.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    🗑️
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Distancia:</span>
                    <p className="font-bold text-gray-800">{activity.distance.toFixed(2)} km</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Tiempo:</span>
                    <p className="font-bold text-gray-800">{formatTime(activity.duration)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Ritmo:</span>
                    <p className="font-bold text-gray-800">{activity.avgPace.toFixed(2)} km/h</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Calorías:</span>
                    <p className="font-bold text-gray-800">{activity.calories.toFixed(0)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // Vista Record
  const RecordView = () => (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-6">
        <button
          onClick={() => setCurrentView('home')}
          className="text-orange-100 hover:text-white mb-4"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-bold">Nueva Actividad</h2>
      </div>

      <div className="p-4">
        {!isTracking ? (
          <>
            <div className="bg-white rounded-lg p-6 mb-4 shadow-md">
              <h3 className="font-bold text-lg mb-4 text-gray-800">¿Qué vas a hacer?</h3>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setActivityType('running');
                    startTracking();
                  }}
                  className="w-full p-4 rounded-lg border-2 border-gray-300 hover:border-orange-600 transition"
                >
                  <span className="text-2xl mr-2">🏃</span>
                  <span className="font-bold">Carrera</span>
                  <span className="text-sm text-gray-600 ml-2">(más calorías)</span>
                </button>
                <button
                  onClick={() => {
                    setActivityType('walking');
                    startTracking();
                  }}
                  className="w-full p-4 rounded-lg border-2 border-gray-300 hover:border-blue-600 transition"
                >
                  <span className="text-2xl mr-2">🚶</span>
                  <span className="font-bold">Caminata</span>
                  <span className="text-sm text-gray-600 ml-2">(ritmo relajado)</span>
                </button>
              </div>
            </div>

            <p className="text-center text-gray-600 text-sm">
              Asegúrate de que tienes la ubicación habilitada
            </p>
          </>
        ) : (
          <div className="bg-white rounded-lg p-6 shadow-md text-center">
            <div className="mb-6">
              <div className="text-6xl mb-4 animate-pulse">
                {currentActivity.type === 'running' ? '🏃' : '🚶'}
              </div>
              <p className="text-2xl font-bold text-gray-800 mb-2 animate-pulse">
                {currentActivity.type === 'running' ? 'Corriendo...' : 'Caminando...'}
              </p>
            </div>

            {/* Stats en tiempo real */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-gray-600 text-sm">Distancia</p>
                <p className="text-3xl font-bold text-orange-600">
                  {(currentActivity.distance / 1000).toFixed(2)} km
                </p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-gray-600 text-sm">Tiempo</p>
                <p className="text-3xl font-bold text-orange-600">
                  {formatTime(currentActivity.duration)}
                </p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-gray-600 text-sm">Ritmo</p>
                <p className="text-3xl font-bold text-orange-600">
                  {currentActivity.avgSpeed.toFixed(1)} km/h
                </p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-gray-600 text-sm">Calorías</p>
                <p className="text-3xl font-bold text-orange-600">
                  {currentActivity.calories.toFixed(0)}
                </p>
              </div>
            </div>

            {/* Botón detener */}
            <button
              onClick={stopTracking}
              className="w-full bg-red-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-red-700 transition"
            >
              ⏹️ Detener Actividad
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Vista Estadísticas
  const StatsView = () => (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-6">
        <button
          onClick={() => setCurrentView('home')}
          className="text-orange-100 hover:text-white mb-4"
        >
          ← Volver
        </button>
        <h2 className="text-2xl font-bold">Estadísticas</h2>
      </div>

      <div className="p-4">
        {activities.length === 0 ? (
          <div className="bg-white p-6 rounded-lg text-center text-gray-500">
            <div className="text-5xl mb-3">📊</div>
            <p>Aún no tienes datos para mostrar</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 shadow-md">
              <p className="text-gray-600 text-sm mb-1">Total Kilómetros</p>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-bold text-orange-600">{stats.totalKm}</p>
                <p className="text-gray-600">km</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-md">
              <p className="text-gray-600 text-sm mb-3">Actividades por Tipo</p>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600">🏃 Carreras</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {activities.filter(a => a.type === 'running').length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">🚶 Caminatas</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {activities.filter(a => a.type === 'walking').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-md">
              <p className="text-gray-600 text-sm mb-1">Ritmo Promedio</p>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-bold text-blue-600">{stats.avgPace}</p>
                <p className="text-gray-600">km/h</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-md">
              <p className="text-gray-600 text-sm mb-1">Total Calorías Quemadas</p>
              <div className="flex items-baseline gap-2">
                <p className="text-4xl font-bold text-yellow-600">{stats.totalCalories}</p>
                <p className="text-gray-600">kcal</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-white h-screen overflow-hidden flex flex-col">
      {currentView === 'home' && <HomeView />}
      {currentView === 'record' && <RecordView />}
      {currentView === 'stats' && <StatsView />}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around">
        <button
          onClick={() => setCurrentView('home')}
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition ${
            currentView === 'home'
              ? 'text-orange-600 bg-orange-50'
              : 'text-gray-600 hover:text-orange-600'
          }`}
        >
          <span className="text-2xl">🏠</span>
          <span className="text-xs font-semibold">Inicio</span>
        </button>
        <button
          onClick={() => setCurrentView('record')}
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition ${
            currentView === 'record'
              ? 'text-orange-600 bg-orange-50'
              : 'text-gray-600 hover:text-orange-600'
          }`}
        >
          <span className="text-2xl">➕</span>
          <span className="text-xs font-semibold">Registrar</span>
        </button>
        <button
          onClick={() => setCurrentView('stats')}
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition ${
            currentView === 'stats'
              ? 'text-orange-600 bg-orange-50'
              : 'text-gray-600 hover:text-orange-600'
          }`}
        >
          <span className="text-2xl">📊</span>
          <span className="text-xs font-semibold">Stats</span>
        </button>
      </div>
    </div>
  );
};

export default StravaMinAPK;
