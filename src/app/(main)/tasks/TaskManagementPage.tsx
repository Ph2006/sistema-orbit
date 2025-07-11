"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TaskManagementPage = () => {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Gestão de Tarefas</h1>
        <Button onClick={() => {
          console.log("Adicionar tarefa");
        }}>
          Adicionar Tarefa
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Suas Tarefas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Sistema de gestão de tarefas em desenvolvimento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskManagementPage;
