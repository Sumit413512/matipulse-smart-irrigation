"""Educational model only: train on GENERATED, NOT FIELD-MEASURED data.

Run from project root: python ml/train_synthetic.py
Synthetic process is intentionally simple, and validation does not establish agricultural accuracy.
"""
from pathlib import Path
import json
import numpy as np
from joblib import dump
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import train_test_split

HERE = Path(__file__).resolve().parent
rng = np.random.default_rng(2026)
n = 2400
moist = rng.uniform(8, 92, n)
temp = rng.uniform(15, 43, n)
humidity = rng.uniform(25, 95, n)
rain = rng.uniform(0, 100, n)
pulse = rng.choice([0,0,0,0,2,4,6],size=n)
# Purely illustrative next-hour process, with assumed light evaporation, rainfall,
# and short-pulse effect. Values and parameters are arbitrary, not fitted from crops.
evaporation = 0.025 * np.maximum(temp - 18, 0) + 0.012 * np.maximum(60 - humidity, 0)
rain_impact = np.maximum(0, rain - 55) * 0.08
pulse_impact = pulse * 1.4
noise = rng.normal(0, 1.7, n)
next_moist = np.clip(moist - evaporation + rain_impact + pulse_impact + noise, 0, 100)
X = np.column_stack([moist, temp, humidity, rain, pulse])
# Random split is appropriate only for *independent synthesized scenarios*.
X_train, X_test, y_train, y_test = train_test_split(X, next_moist, test_size=.25, random_state=2026)
model=RandomForestRegressor(n_estimators=90,min_samples_leaf=3,max_depth=14,n_jobs=-1,random_state=2026)
model.fit(X_train,y_train)
pred=model.predict(X_test)
report={
 'dataset':'synthetic random scenarios (generated, not measured)',
 'n_samples':n,'training_samples':len(X_train),'holdout_samples':len(X_test),
 'split':'random 75/25 independent synthetic examples, seed 2026',
 'model':'RandomForestRegressor', 'horizon':'illustrative next-hour wetness index',
 'model_mae':round(float(mean_absolute_error(y_test,pred)),3),
 'model_rmse':round(float(np.sqrt(mean_squared_error(y_test,pred))),3),
 'baseline_mae':round(float(mean_absolute_error(y_test, X_test[:,0])),3),
 'validated_on_real_soil':False,
 'allow_motor_control':False,
 'warning':'Not a measured field result; do not claim water savings or predictive accuracy on real farms.'
}
dump(model,HERE/'synthetic_model.joblib',compress=3)
(HERE/'metrics.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
